import asyncio
import io
import json
import os
import queue as thread_queue
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MLX TTS Studio")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


_model = None
_model_name: Optional[str] = None
_gen_lock = asyncio.Lock()
_audio_store: dict[str, tuple[bytes, float, dict]] = {}
_ref_dir = tempfile.mkdtemp(prefix="mlx_tts_ref_")
_preview_cache: dict[str, bytes] = {}
_cancel = threading.Event()

MODEL_CONFIG = {
    "types": [
        {"id": "Base", "label": "Base", "desc": "Clone any voice from an audio sample"},
        {"id": "CustomVoice", "label": "Custom Voice", "desc": "Built-in preset speakers"},
        {"id": "VoiceDesign", "label": "Voice Design", "desc": "Create voice from text prompt"},
    ],
    "sizes": {
        "Base": ["0.6B", "1.7B"],
        "CustomVoice": ["0.6B", "1.7B"],
        "VoiceDesign": ["1.7B"],
    },
    "quants": ["bf16", "8bit", "6bit", "5bit", "4bit"],
    "default": {"type": "CustomVoice", "size": "1.7B", "quant": "bf16"},
    "repo_template": "mlx-community/Qwen3-TTS-12Hz-{size}-{type}-{quant}",
}


def _patch_tqdm(pq: thread_queue.Queue, cancel_ev: threading.Event):
    import tqdm.std
    _orig = tqdm.std.tqdm.update

    def _patched(self, n=1):
        if cancel_ev.is_set():
            raise InterruptedError("Cancelled")
        _orig(self, n)
        try:
            total = self.total
            if total and total > 0:
                pct = int(self.n / total * 100)
                desc = (self.desc or "").strip().rstrip(":")
                if total > 10_000_000:
                    g = total / 1e9
                    detail = (f"{self.n / 1e9:.2f}/{g:.2f} GB" if g >= 1
                              else f"{self.n / 1e6:.0f}/{total / 1e6:.0f} MB")
                else:
                    detail = f"{self.n}/{int(total)}"
                if desc:
                    detail = f"{desc} {detail}"
                pq.put_nowait({"detail": detail, "pct": pct})
        except Exception:
            pass

    tqdm.std.tqdm.update = _patched
    return lambda: setattr(tqdm.std.tqdm, "update", _orig)



def _load_model_sync(repo: str):
    global _model, _model_name
    if _model is not None and _model_name == repo:
        return _model
    if _model is not None:
        del _model
        _model = None
        import mlx.core as mx
        mx.clear_cache()
    from mlx_audio.tts import load
    _model = load(repo)
    _model_name = repo
    return _model


def _generate_sync(
    model,
    text: str,
    voice: str,
    speed: float,
    temperature: float,
    max_tokens: int,
    lang_code: str,
    ref_audio_path: Optional[str],
    ref_text: Optional[str],
    instruct: Optional[str],
    top_p: float = 0.9,
    top_k: int = 50,
    repetition_penalty: float = 1.1,
) -> tuple[bytes, dict]:
    import mlx.core as mx
    from mlx_audio.audio_io import write as audio_write

    kw: dict = dict(
        text=text, voice=voice, speed=speed,
        temperature=temperature, max_tokens=max_tokens,
        lang_code=lang_code, verbose=False, stream=False,
        top_p=top_p, top_k=top_k,
        repetition_penalty=repetition_penalty,
    )

    if ref_audio_path:
        from mlx_audio.utils import load_audio
        normalize = getattr(model, "model_type", "") == "spark"
        kw["ref_audio"] = load_audio(
            ref_audio_path, sample_rate=model.sample_rate, volume_normalize=normalize,
        )
        if ref_text:
            kw["ref_text"] = ref_text

    if instruct:
        kw["instruct"] = instruct

    t0 = time.time()
    results = model.generate(**kw)

    parts, stats = [], {}
    for r in results:
        parts.append(r.audio)
        try:
            stats = dict(
                duration=str(r.audio_duration),
                rtf=f"{r.real_time_factor:.2f}x",
                proc=f"{r.processing_time_seconds:.2f}s",
                mem=f"{r.peak_memory_usage:.2f} GB",
            )
        except Exception:
            pass

    if not parts:
        raise RuntimeError("Model returned no audio")
    audio = mx.concatenate(parts, axis=0) if len(parts) > 1 else parts[0]
    buf = io.BytesIO()
    audio_write(buf, audio, model.sample_rate, format="wav")
    wav = buf.getvalue()

    stats["total"] = f"{time.time() - t0:.1f}s"
    stats["size"] = f"{len(wav) / 1024 / 1024:.1f} MB"
    return wav, stats



@app.get("/", response_class=HTMLResponse)
async def index():
    return (Path(__file__).parent / "index.html").read_text()


@app.get("/logo.png")
async def logo():
    p = Path(__file__).parent / "logo.png"
    if not p.exists():
        raise HTTPException(404)
    return Response(content=p.read_bytes(), media_type="image/png")


@app.get("/api/config")
async def config():
    return MODEL_CONFIG


@app.get("/api/status")
async def status():
    return {"model_loaded": _model_name}


@app.post("/api/upload-ref")
async def upload_ref(file: UploadFile = File(...)):
    ext = Path(file.filename or "clip.wav").suffix or ".wav"
    name = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(_ref_dir, name)
    with open(fpath, "wb") as f:
        f.write(await file.read())
    return {"ref_id": name, "filename": file.filename}


@app.delete("/api/ref/{ref_id}")
async def delete_ref(ref_id: str):
    if "/" in ref_id or "\\" in ref_id or ".." in ref_id:
        raise HTTPException(400, "Invalid ref_id")
    p = os.path.join(_ref_dir, ref_id)
    if os.path.exists(p):
        os.unlink(p)
    return {"ok": True}


@app.get("/api/audio/{audio_id}")
async def get_audio(audio_id: str):
    entry = _audio_store.get(audio_id)
    if not entry:
        raise HTTPException(404, "Audio not found or expired")
    wav = entry[0]
    return Response(
        content=wav, media_type="audio/wav",
        headers={"Content-Disposition": f'attachment; filename="tts_{audio_id[:8]}.wav"'},
    )


PREVIEW_TEXT = "Hello! This is a preview of how I sound."


@app.post("/api/preview")
async def preview_voice(request: Request):
    body = await request.json()
    voice = body.get("voice", "Vivian")
    repo = body.get("model", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16")
    key = f"{repo}::{voice}"
    if key in _preview_cache:
        return Response(content=_preview_cache[key], media_type="audio/wav")
    async with _gen_lock:
        if key in _preview_cache:
            return Response(content=_preview_cache[key], media_type="audio/wav")
        try:
            model = await asyncio.to_thread(_load_model_sync, repo)
            wav, _ = await asyncio.to_thread(
                _generate_sync, model, PREVIEW_TEXT,
                voice, 1.0, 0.7, 2048, "en", None, None, None,
            )
            _preview_cache[key] = wav
            return Response(content=wav, media_type="audio/wav")
        except Exception as e:
            raise HTTPException(500, str(e))


@app.post("/api/cancel")
async def cancel_generation():
    _cancel.set()
    return {"ok": True}


@app.post("/api/generate")
async def generate(request: Request):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Text is required")

    repo      = body.get("model", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16")
    voice     = body.get("voice", "")
    speed     = float(body.get("speed", 1.0))
    temp      = float(body.get("temperature", 0.7))
    max_tok   = int(body.get("max_tokens", 4096))
    lang      = body.get("lang_code", "auto")
    ref_id    = body.get("ref_id")
    ref_text  = body.get("ref_text") or None
    instruct  = body.get("instruct") or None
    top_p     = float(body.get("top_p", 0.9))
    top_k     = int(body.get("top_k", 50))
    rep_pen   = float(body.get("repetition_penalty", 1.1))
    ref_path = None
    if ref_id:
        if "/" in ref_id or "\\" in ref_id or ".." in ref_id:
            raise HTTPException(400, "Invalid ref_id")
        ref_path = os.path.join(_ref_dir, ref_id)
        if not os.path.exists(ref_path):
            raise HTTPException(400, "Reference audio file not found — re-upload")

    q: asyncio.Queue = asyncio.Queue()

    async def _work():
        _cancel.clear()
        try:
            cached = _model is not None and _model_name == repo

            if cached:
                await q.put({"s": "loading", "cached": True})
                model = _model
            else:
                await q.put({"s": "downloading", "detail": "", "pct": 0})

                pq: thread_queue.Queue = thread_queue.Queue()
                unpatch = _patch_tqdm(pq, _cancel)
                try:
                    fut = asyncio.ensure_future(
                        asyncio.to_thread(_load_model_sync, repo)
                    )
                    while not fut.done():
                        await asyncio.sleep(0.3)
                        last = None
                        while True:
                            try:
                                last = pq.get_nowait()
                            except thread_queue.Empty:
                                break
                        if last:
                            await q.put({"s": "downloading", **last})
                    model = await fut
                finally:
                    unpatch()

            if _cancel.is_set():
                await q.put({"s": "cancelled"})
                return

            await q.put({"s": "generating"})
            wav, stats = await asyncio.to_thread(
                _generate_sync, model, text, voice, speed, temp,
                max_tok, lang, ref_path, ref_text, instruct,
                top_p, top_k, rep_pen,
            )

            if _cancel.is_set():
                await q.put({"s": "cancelled"})
                return

            aid = uuid.uuid4().hex[:16]
            _audio_store[aid] = (wav, time.time(), stats)
            cutoff = time.time() - 7200
            for k in [k for k, v in _audio_store.items() if v[1] < cutoff]:
                del _audio_store[k]

            await q.put({"s": "done", "id": aid, "stats": stats})
        except InterruptedError:
            await q.put({"s": "cancelled"})
        except Exception as exc:
            await q.put({"s": "error", "m": str(exc)})

    async def _sse():
        async with _gen_lock:
            task = asyncio.create_task(_work())
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=600)
                except asyncio.TimeoutError:
                    yield _evt({"s": "error", "m": "Timed out (10 min)"})
                    break
                yield _evt(ev)
                if ev["s"] in ("done", "error", "cancelled"):
                    break
            await task

    return StreamingResponse(_sse(), media_type="text/event-stream")


def _evt(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"



if __name__ == "__main__":
    import socket
    import uvicorn

    port = 7860
    while port <= 7870:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                break
            except OSError:
                print(f"Port {port} busy, trying {port + 1}…")
                port += 1
    print(f"MLX TTS Studio → http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
