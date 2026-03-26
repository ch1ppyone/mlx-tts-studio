import os
os.environ["HF_HUB_DISABLE_XET"] = "1"

import asyncio
import io
import json
import mimetypes
import queue as thread_queue
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from audio_preprocess import (
    build_passthrough_report,
    ffmpeg_available,
    parse_options,
    preprocess_audio,
    probe_audio,
)
from config import (
    HOST, PORT, PORT_RANGE, AUDIO_TTL, TEMP_DIR,
    PREVIEW_TEXT, MAX_AUDIO_STORE, APP_DIR, STATIC_DIR,
    VERSION, HF_CACHE_DIR, AUTO_OPEN_BROWSER, REF_DIR,
)
from engines import ENGINES, PARAM_DEFS, build_generate_kwargs

app = FastAPI(title="MLX TTS Studio")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

_model = None
_model_key: Optional[tuple[str, str]] = None
_gen_lock = asyncio.Lock()
_audio_store: dict[str, tuple[bytes, float, dict]] = {}
_ref_dir = str(REF_DIR)
_ref_store: dict[str, dict] = {}
_ref_index_path = os.path.join(_ref_dir, "_refs_index.json")
_preview_cache: dict[str, bytes] = {}
_cancel = threading.Event()
_start_time = time.time()

Path(_ref_dir).mkdir(parents=True, exist_ok=True)


def _model_cache_state(repo: str) -> str:
    if _model is not None and _model_key and _model_key[1] == repo:
        return "loaded"
    dir_name = "models--" + repo.replace("/", "--")
    snap_dir = HF_CACHE_DIR / dir_name / "snapshots"
    if snap_dir.is_dir():
        try:
            if any(snap_dir.iterdir()):
                return "cached"
        except OSError:
            pass
    return "not_cached"


def _system_specs() -> dict:
    cpu = ""
    ram_gb = None
    try:
        if os.uname().sysname == "Darwin":
            proc = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
            )
            if proc.returncode == 0:
                cpu = proc.stdout.strip()
            mem = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True,
                text=True,
            )
            if mem.returncode == 0:
                mem_bytes = int(mem.stdout.strip())
                ram_gb = round(mem_bytes / (1024 ** 3))
    except Exception:
        pass
    return {"cpu": cpu, "ram_gb": ram_gb}


def _model_cache_snapshot_dir(repo: str) -> Optional[Path]:
    dir_name = "models--" + repo.replace("/", "--")
    snap_dir = HF_CACHE_DIR / dir_name / "snapshots"
    if not snap_dir.is_dir():
        return None
    try:
        snapshots = [p for p in snap_dir.iterdir() if p.is_dir()]
    except OSError:
        return None
    if not snapshots:
        return None
    snapshots.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return snapshots[0]


def _patch_tqdm(pq: thread_queue.Queue, cancel_ev: threading.Event):
    import tqdm.std
    _orig = tqdm.std.tqdm.update

    def _patched(self, n=1):
        if cancel_ev.is_set():
            raise InterruptedError("Cancelled")
        _orig(self, n)
        try:
            total = self.total
            desc = (self.desc or "").strip().rstrip(":")
            log_line = str(self)
            key = desc or str(id(self))
            if total and total > 0:
                pct = int(self.n / total * 100)
                if total > 10_000_000:
                    g = total / 1e9
                    detail = (f"{self.n / 1e9:.2f}/{g:.2f} GB" if g >= 1
                              else f"{self.n / 1e6:.0f}/{total / 1e6:.0f} MB")
                else:
                    detail = f"{self.n}/{int(total)}"
                if desc:
                    detail = f"{desc} {detail}"
                pq.put_nowait({"detail": detail, "pct": pct,
                               "log": log_line, "key": key})
            elif log_line.strip():
                pq.put_nowait({"log": log_line, "key": key})
        except Exception:
            pass

    tqdm.std.tqdm.update = _patched
    return lambda: setattr(tqdm.std.tqdm, "update", _orig)


def _load_model_sync(engine_id: str, repo: str):
    global _model, _model_key
    key = (engine_id, repo)
    if _model is not None and _model_key == key:
        return _model
    if _model is not None:
        del _model
        _model = None
        import mlx.core as mx
        mx.clear_cache()
    from mlx_audio.tts import load
    _model = load(repo)
    _model_key = key
    return _model


def _generate_sync(
    engine_id: str,
    model,
    body: dict,
    ref_audio_path: Optional[str] = None,
    ref_text: Optional[str] = None,
) -> tuple[bytes, dict]:
    import mlx.core as mx
    from mlx_audio.audio_io import write as audio_write

    kw = build_generate_kwargs(engine_id, model, body)

    if ref_audio_path:
        from mlx_audio.utils import load_audio
        normalize = getattr(model, "model_type", "") == "spark"
        kw["ref_audio"] = load_audio(
            ref_audio_path, sample_rate=model.sample_rate, volume_normalize=normalize,
        )
        if ref_text:
            kw["ref_text"] = ref_text

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


def _cleanup_audio():
    cutoff = time.time() - AUDIO_TTL
    for k in [k for k, v in _audio_store.items() if v[1] < cutoff]:
        del _audio_store[k]
    while len(_audio_store) > MAX_AUDIO_STORE:
        oldest = min(_audio_store, key=lambda k: _audio_store[k][1])
        del _audio_store[oldest]


def _evt(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _is_safe_ref_id(ref_id: str) -> bool:
    return "/" not in ref_id and "\\" not in ref_id and ".." not in ref_id


def _guess_media_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext == ".m4a":
        return "audio/mp4"
    if ext == ".mp3":
        return "audio/mpeg"
    if ext == ".wav":
        return "audio/wav"
    mt, _ = mimetypes.guess_type(path)
    return mt or "application/octet-stream"


def _serialize_ref(entry: dict) -> dict:
    report = entry.get("preprocess_report") or {}
    display_name = entry.get("display_name") or entry.get("filename") or entry.get("ref_id")
    return {
        "ref_id": entry["ref_id"],
        "filename": entry.get("filename"),
        "display_name": display_name,
        "original_path": entry.get("original_path"),
        "processed_path": entry.get("processed_path"),
        "preprocess_status": entry.get("preprocess_status", "none"),
        "preprocess_options": entry.get("preprocess_options") or {},
        "warnings": report.get("warnings") or [],
        "recommendations": report.get("recommendations") or [],
        "report": report,
        "preview_urls": {
            "original": f"/api/ref/{entry['ref_id']}/audio?variant=original",
            "processed": f"/api/ref/{entry['ref_id']}/audio?variant=processed",
        },
    }


def _get_ref_entry(ref_id: str) -> Optional[dict]:
    entry = _ref_store.get(ref_id)
    if entry:
        return entry
    legacy_path = os.path.join(_ref_dir, ref_id)
    if not os.path.exists(legacy_path):
        return None
    entry = {
        "ref_id": ref_id,
        "filename": ref_id,
        "display_name": ref_id,
        "original_path": legacy_path,
        "processed_path": None,
        "preprocess_status": "none",
        "preprocess_options": {},
        "preprocess_report": {},
        "created_at": time.time(),
    }
    _ref_store[ref_id] = entry
    _save_ref_store()
    return entry


def _active_ref_path(ref_id: str) -> Optional[str]:
    entry = _get_ref_entry(ref_id)
    if not entry:
        return None
    p_processed = entry.get("processed_path")
    if p_processed and os.path.exists(p_processed):
        return p_processed
    p_original = entry.get("original_path")
    if p_original and os.path.exists(p_original):
        return p_original
    return None


def _reference_duration(path: str) -> float:
    try:
        return float(probe_audio(path).duration_sec or 0.0)
    except Exception:
        return 0.0


def _select_ref_for_generate(ref_id: str) -> str:
    entry = _get_ref_entry(ref_id)
    if not entry:
        raise HTTPException(400, "Reference audio file not found — re-upload")
    processed = entry.get("processed_path")
    original = entry.get("original_path")
    candidates: list[tuple[str, float]] = []
    for path in [processed, original]:
        if path and os.path.exists(path):
            candidates.append((path, _reference_duration(path)))
    if not candidates:
        raise HTTPException(400, "Reference audio file not found — re-upload")
    valid = [item for item in candidates if item[1] >= 0.35]
    if valid:
        return valid[0][0]
    longest = max(candidates, key=lambda x: x[1])
    if longest[1] > 0:
        return longest[0]
    raise HTTPException(
        400,
        "Reference audio is empty after preprocessing. Re-upload a 5–15s clear sample.",
    )


def _save_ref_store() -> None:
    try:
        payload = {"items": _ref_store}
        tmp_path = _ref_index_path + ".tmp"
        Path(tmp_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        os.replace(tmp_path, _ref_index_path)
    except Exception:
        pass


def _load_ref_store() -> None:
    global _ref_store
    if not os.path.exists(_ref_index_path):
        _ref_store = {}
        return
    try:
        raw = json.loads(Path(_ref_index_path).read_text())
        items = raw.get("items", {})
        if not isinstance(items, dict):
            items = {}
    except Exception:
        _ref_store = {}
        return

    loaded: dict[str, dict] = {}
    for ref_id, entry in items.items():
        if not isinstance(entry, dict):
            continue
        if not _is_safe_ref_id(ref_id):
            continue
        original_path = entry.get("original_path")
        processed_path = entry.get("processed_path")
        if not original_path or not os.path.exists(original_path):
            continue
        if processed_path and not os.path.exists(processed_path):
            processed_path = None
        loaded[ref_id] = {
            "ref_id": ref_id,
            "filename": entry.get("filename") or ref_id,
            "display_name": entry.get("display_name") or entry.get("filename") or ref_id,
            "original_path": original_path,
            "processed_path": processed_path,
            "preprocess_status": entry.get("preprocess_status", "none"),
            "preprocess_options": entry.get("preprocess_options") or {},
            "preprocess_report": entry.get("preprocess_report") or {},
            "created_at": entry.get("created_at", time.time()),
        }
    _ref_store = loaded


def _process_reference_file(source_path: str, opts) -> tuple[str, str, dict, dict]:
    if ffmpeg_available():
        try:
            out = preprocess_audio(source_path, _ref_dir, opts)
            return out["output_path"], "ready", out["report"], out["options"]
        except Exception as exc:
            fallback = build_passthrough_report(source_path, opts)
            report = fallback["report"]
            warnings = report.get("warnings") or []
            warnings.append(f"Preprocessing failed, using original audio: {exc}")
            report["warnings"] = warnings
            return fallback["output_path"], "degraded", report, fallback["options"]
    fallback = build_passthrough_report(source_path, opts)
    return fallback["output_path"], "degraded", fallback["report"], fallback["options"]


_load_ref_store()


@app.get("/", response_class=HTMLResponse)
async def index():
    return (APP_DIR / "index.html").read_text()


@app.get("/logo.png")
async def logo():
    p = APP_DIR / "logo.png"
    if not p.exists():
        raise HTTPException(404)
    return Response(content=p.read_bytes(), media_type="image/png")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": VERSION,
        "uptime": round(time.time() - _start_time),
    }


@app.get("/api/config")
async def config():
    return {"engines": ENGINES, "params": PARAM_DEFS}


@app.get("/api/status")
async def status():
    loaded = None
    if _model_key:
        loaded = {"engine": _model_key[0], "model": _model_key[1]}
    return {
        "model_loaded": loaded,
        "version": VERSION,
        "cache_dir": str(HF_CACHE_DIR),
        "ref_dir": _ref_dir,
        "preview_count": len(_preview_cache),
        "audio_count": len(_audio_store),
        "system": _system_specs(),
    }


@app.get("/api/cache-status")
async def cache_status():
    result = {}
    for eng in ENGINES.values():
        for m in eng["models"]:
            result[m["id"]] = _model_cache_state(m["id"])
    return result


@app.post("/api/cache-open")
async def cache_open(request: Request):
    body = await request.json()
    model_id = (body or {}).get("model_id")
    if not model_id:
        raise HTTPException(400, "model_id is required")
    target = _model_cache_snapshot_dir(model_id)
    if not target or not target.exists():
        raise HTTPException(404, "Model cache folder not found")
    try:
        subprocess.run(["open", str(target)], check=True)
    except Exception as exc:
        raise HTTPException(500, f"Failed to open Finder: {exc}")
    return {"ok": True, "path": str(target)}


@app.post("/api/upload-ref")
async def upload_ref(
    file: UploadFile = File(...),
    preprocess_options: Optional[str] = Form(None),
):
    ext = Path(file.filename or "clip.wav").suffix or ".wav"
    ref_id = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(_ref_dir, ref_id)
    with open(fpath, "wb") as f:
        f.write(await file.read())

    opts_payload = None
    if preprocess_options:
        try:
            opts_payload = json.loads(preprocess_options)
        except Exception:
            opts_payload = None
    opts = parse_options(opts_payload)

    processed_path, status, report, stored_opts = _process_reference_file(fpath, opts)

    entry = {
        "ref_id": ref_id,
        "filename": file.filename,
        "display_name": file.filename or ref_id,
        "original_path": fpath,
        "processed_path": processed_path,
        "preprocess_status": status,
        "preprocess_options": stored_opts,
        "preprocess_report": report,
        "created_at": time.time(),
    }
    _ref_store[ref_id] = entry
    _save_ref_store()
    return {
        "ref_id": ref_id,
        "filename": file.filename,
        "ref": _serialize_ref(entry),
    }


@app.get("/api/ref/{ref_id}/meta")
async def ref_meta(ref_id: str):
    if not _is_safe_ref_id(ref_id):
        raise HTTPException(400, "Invalid ref_id")
    entry = _get_ref_entry(ref_id)
    if not entry:
        raise HTTPException(404, "Reference audio file not found")
    return {"ok": True, "ref": _serialize_ref(entry)}


@app.get("/api/ref/list")
async def ref_list():
    items: list[dict] = []
    for ref_id, entry in _ref_store.items():
        source = entry.get("original_path")
        if not source or not os.path.exists(source):
            continue
        items.append(
            {
                "ref_id": ref_id,
                "filename": entry.get("filename") or ref_id,
                "display_name": entry.get("display_name") or entry.get("filename") or ref_id,
                "created_at": entry.get("created_at", 0),
                "preprocess_status": entry.get("preprocess_status", "none"),
            }
        )
    items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return {"items": items}


@app.post("/api/ref/{ref_id}/preprocess")
async def reprocess_ref(ref_id: str, request: Request):
    if not _is_safe_ref_id(ref_id):
        raise HTTPException(400, "Invalid ref_id")
    entry = _get_ref_entry(ref_id)
    if not entry:
        raise HTTPException(404, "Reference audio file not found")
    body = await request.json()
    opts = parse_options((body or {}).get("options") or body or {})
    source = entry.get("original_path")
    if not source or not os.path.exists(source):
        raise HTTPException(404, "Original reference audio not found")

    prev_processed = entry.get("processed_path")
    processed_path, status, report, stored_opts = _process_reference_file(source, opts)

    entry["processed_path"] = processed_path
    entry["preprocess_status"] = status
    entry["preprocess_options"] = stored_opts
    entry["preprocess_report"] = report
    _ref_store[ref_id] = entry
    _save_ref_store()

    if (
        prev_processed
        and prev_processed != source
        and prev_processed != processed_path
        and os.path.exists(prev_processed)
    ):
        try:
            os.unlink(prev_processed)
        except OSError:
            pass

    return {"ok": True, "ref": _serialize_ref(entry)}


@app.post("/api/ref/{ref_id}/rename")
async def rename_ref(ref_id: str, request: Request):
    if not _is_safe_ref_id(ref_id):
        raise HTTPException(400, "Invalid ref_id")
    entry = _get_ref_entry(ref_id)
    if not entry:
        raise HTTPException(404, "Reference audio file not found")
    body = await request.json()
    new_name = str((body or {}).get("name") or "").strip()
    if not new_name:
        raise HTTPException(400, "name is required")
    if len(new_name) > 120:
        raise HTTPException(400, "name is too long")
    entry["display_name"] = new_name
    _ref_store[ref_id] = entry
    _save_ref_store()
    return {"ok": True, "ref": _serialize_ref(entry)}


@app.get("/api/ref/{ref_id}/audio")
async def get_ref_audio(ref_id: str, variant: str = "processed"):
    if not _is_safe_ref_id(ref_id):
        raise HTTPException(400, "Invalid ref_id")
    entry = _get_ref_entry(ref_id)
    if not entry:
        raise HTTPException(404, "Reference audio file not found")
    if variant == "original":
        path = entry.get("original_path")
    else:
        path = entry.get("processed_path") or entry.get("original_path")
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Reference audio variant not found")
    data = Path(path).read_bytes()
    return Response(content=data, media_type=_guess_media_type(path))


@app.delete("/api/ref/{ref_id}")
async def delete_ref(ref_id: str):
    if not _is_safe_ref_id(ref_id):
        raise HTTPException(400, "Invalid ref_id")
    entry = _ref_store.pop(ref_id, None)
    if entry:
        original_path = entry.get("original_path")
        processed_path = entry.get("processed_path")
        for p in [processed_path, original_path]:
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass
    else:
        p = os.path.join(_ref_dir, ref_id)
        if os.path.exists(p):
            os.unlink(p)
    _save_ref_store()
    return {"ok": True}


@app.head("/api/audio/{audio_id}")
async def head_audio(audio_id: str):
    entry = _audio_store.get(audio_id)
    if not entry:
        raise HTTPException(404, "Audio not found or expired")
    return Response(
        status_code=200,
        headers={"Content-Length": str(len(entry[0])), "Content-Type": "audio/wav"},
    )


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


@app.post("/api/preview")
async def preview_voice(request: Request):
    body = await request.json()
    engine_id = body.get("engine", "qwen3")
    eng = ENGINES.get(engine_id)
    if not eng:
        raise HTTPException(400, f"Unknown engine: {engine_id}")
    cap = eng.get("capabilities", {})
    if not cap.get("preview"):
        raise HTTPException(400, f"Engine {engine_id} does not support preview")
    voice = body.get("voice") or eng.get("default_voice", "")
    repo = body.get("model") or eng["default_model"]
    cache_key = f"{engine_id}::{repo}::{voice}"
    if cache_key in _preview_cache:
        return Response(content=_preview_cache[cache_key], media_type="audio/wav")
    async with _gen_lock:
        if cache_key in _preview_cache:
            return Response(content=_preview_cache[cache_key], media_type="audio/wav")
        try:
            model = await asyncio.to_thread(_load_model_sync, engine_id, repo)
            preview_body = {"text": PREVIEW_TEXT, "voice": voice}
            wav, _ = await asyncio.to_thread(
                _generate_sync, engine_id, model, preview_body,
            )
            _preview_cache[cache_key] = wav
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

    engine_id = body.get("engine", "qwen3")
    eng = ENGINES.get(engine_id)
    if not eng:
        raise HTTPException(400, f"Unknown engine: {engine_id}")

    repo = body.get("model") or eng["default_model"]
    ref_id = body.get("ref_id")
    ref_text = body.get("ref_text") or None
    ref_path = None
    if ref_id:
        if not _is_safe_ref_id(ref_id):
            raise HTTPException(400, "Invalid ref_id")
        ref_path = _select_ref_for_generate(ref_id)

    q: asyncio.Queue = asyncio.Queue()

    async def _work():
        _cancel.clear()
        try:
            cached = _model is not None and _model_key == (engine_id, repo)

            if cached:
                await q.put({"s": "loading", "cached": True})
                model = _model
            else:
                await q.put({"s": "downloading", "detail": "", "pct": 0})

                pq: thread_queue.Queue = thread_queue.Queue()
                unpatch = _patch_tqdm(pq, _cancel)
                try:
                    fut = asyncio.ensure_future(
                        asyncio.to_thread(_load_model_sync, engine_id, repo)
                    )
                    bar_states: dict[str, str] = {}
                    while not fut.done():
                        await asyncio.sleep(0.3)
                        progress = None
                        while True:
                            try:
                                item = pq.get_nowait()
                            except thread_queue.Empty:
                                break
                            if "pct" in item:
                                progress = {
                                    "detail": item["detail"],
                                    "pct": item["pct"],
                                }
                            if "log" in item:
                                bar_states[item["key"]] = item["log"]
                        if progress or bar_states:
                            ev: dict = {"s": "downloading"}
                            if progress:
                                ev.update(progress)
                            if bar_states:
                                ev["logs"] = list(bar_states.values())
                            await q.put(ev)
                    model = await fut
                finally:
                    unpatch()

            if _cancel.is_set():
                await q.put({"s": "cancelled"})
                return

            await q.put({"s": "generating"})
            gen_pq: thread_queue.Queue = thread_queue.Queue()
            unpatch = _patch_tqdm(gen_pq, _cancel)
            try:
                fut = asyncio.ensure_future(
                    asyncio.to_thread(
                        _generate_sync, engine_id, model, body, ref_path, ref_text,
                    )
                )
                while not fut.done():
                    await asyncio.sleep(0.1)
                    while True:
                        try:
                            gen_pq.get_nowait()
                        except thread_queue.Empty:
                            break
                wav, stats = await fut
            finally:
                unpatch()

            if _cancel.is_set():
                await q.put({"s": "cancelled"})
                return

            aid = uuid.uuid4().hex[:16]
            _audio_store[aid] = (wav, time.time(), stats)
            _cleanup_audio()

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


def _print_banner(port: int, first_run_hint: bool):
    url = f"http://localhost:{port}"
    W = 48
    print()
    print(f"  \033[1m{'=' * W}\033[0m")
    print(f"  \033[1m  MLX TTS Studio  v{VERSION}\033[0m")
    print(f"  {'=' * W}")
    print()
    print(f"  \033[1mLocal:\033[0m   {url}")
    print(f"  \033[1mCache:\033[0m   {HF_CACHE_DIR}")
    print()
    if first_run_hint:
        print("  \033[33mFirst run detected. Models will be downloaded")
        print("  on first generation (~1\u20133 GB per model).\033[0m")
        print()
    print("  Press \033[1mCtrl+C\033[0m to stop the server.")
    print(f"  {'=' * W}")
    print()


if __name__ == "__main__":
    import socket
    import webbrowser
    import uvicorn

    any_cached = any(
        _model_cache_state(m["id"]) != "not_cached"
        for eng in ENGINES.values()
        for m in eng["models"]
    )

    port = PORT
    for p in range(port, port + PORT_RANGE):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, p))
                port = p
                break
            except OSError:
                print(f"  Port {p} busy, trying {p + 1}\u2026")

    _print_banner(port, first_run_hint=not any_cached)

    if AUTO_OPEN_BROWSER:
        threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{port}")).start()

    uvicorn.run(app, host=HOST, port=port, log_level="warning")
