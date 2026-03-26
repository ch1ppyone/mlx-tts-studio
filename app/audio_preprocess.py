from __future__ import annotations

import json
import re
import subprocess
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class PreprocessOptions:
    auto: bool = True
    trim_silence: bool = True
    normalize: bool = True
    light_denoise: bool = False
    high_pass: bool = False
    peak_protect: bool = True
    target_sr: int = 24000
    force_mono: bool = True


@dataclass
class AudioProbe:
    duration_sec: float
    sample_rate: int
    channels: int
    codec: str
    bit_rate: int | None


def _run(cmd: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def ffmpeg_available() -> bool:
    code, _, _ = _run(["ffmpeg", "-version"])
    if code != 0:
        return False
    code, _, _ = _run(["ffprobe", "-version"])
    return code == 0


def _safe_float(raw: Any, default: float = 0.0) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _safe_int(raw: Any, default: int = 0) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def parse_options(payload: dict[str, Any] | None) -> PreprocessOptions:
    if not payload:
        return PreprocessOptions()
    opts = PreprocessOptions()
    for key in (
        "auto",
        "trim_silence",
        "normalize",
        "light_denoise",
        "high_pass",
        "peak_protect",
        "force_mono",
    ):
        if key in payload:
            setattr(opts, key, bool(payload.get(key)))
    if "target_sr" in payload:
        sr = _safe_int(payload.get("target_sr"), opts.target_sr)
        if 8000 <= sr <= 96000:
            opts.target_sr = sr
    if opts.auto:
        opts.trim_silence = True
        opts.normalize = True
        opts.light_denoise = False
        opts.high_pass = False
        opts.peak_protect = True
        opts.force_mono = True
    return opts


def probe_audio(path: str | Path) -> AudioProbe:
    code, out, err = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(path),
        ]
    )
    if code != 0:
        raise RuntimeError(err.strip() or "ffprobe failed")
    data = json.loads(out)
    streams = data.get("streams", [])
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not audio_stream:
        raise RuntimeError("No audio stream found")
    fmt = data.get("format", {})
    return AudioProbe(
        duration_sec=_safe_float(fmt.get("duration"), _safe_float(audio_stream.get("duration"), 0.0)),
        sample_rate=_safe_int(audio_stream.get("sample_rate"), 0),
        channels=_safe_int(audio_stream.get("channels"), 0),
        codec=str(audio_stream.get("codec_name") or ""),
        bit_rate=_safe_int(audio_stream.get("bit_rate"), 0) or _safe_int(fmt.get("bit_rate"), 0) or None,
    )


def _extract_stat(pattern: str, text: str) -> float | None:
    matches = re.findall(pattern, text, flags=re.IGNORECASE)
    if not matches:
        return None
    try:
        return float(matches[-1])
    except ValueError:
        return None


def analyze_signal(path: str | Path) -> dict[str, Any]:
    code, _, err = _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            "astats=metadata=1:reset=0,silencedetect=n=-42dB:d=0.6",
            "-f",
            "null",
            "-",
        ]
    )
    if code != 0 and "Error while filtering" in err:
        raise RuntimeError("Audio analysis failed")

    rms_db = _extract_stat(r"RMS level dB:\s*(-?\d+(?:\.\d+)?)", err)
    peak_db = _extract_stat(r"Peak level dB:\s*(-?\d+(?:\.\d+)?)", err)
    noise_floor_db = _extract_stat(r"Noise floor dB:\s*(-?\d+(?:\.\d+)?)", err)
    clipped_samples = _extract_stat(r"Number of clipped samples:\s*(\d+)", err)
    clipped_samples_i = int(clipped_samples or 0)

    silence_starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", err)]
    silence_ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", err)]
    silence_durations = [float(x) for x in re.findall(r"silence_duration:\s*([0-9.]+)", err)]
    total_silence = sum(silence_durations)
    leading_silence = silence_starts[0] if silence_starts and silence_starts[0] < 1.0 else 0.0
    trailing_silence = 0.0
    if silence_ends and silence_durations:
        trailing_silence = silence_durations[-1]

    return {
        "rms_db": rms_db,
        "peak_db": peak_db,
        "noise_floor_db": noise_floor_db,
        "clipped_samples": clipped_samples_i,
        "silence_total_sec": round(total_silence, 3),
        "silence_leading_sec": round(leading_silence, 3),
        "silence_trailing_sec": round(trailing_silence, 3),
    }


def quality_warnings(probe: AudioProbe, analysis: dict[str, Any]) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    recommendations: list[str] = []
    d = probe.duration_sec
    if d < 2.5:
        warnings.append("Reference is very short. Voice identity may be unstable.")
    elif d > 30:
        warnings.append("Reference is long. Best cloning quality is usually in the 5–15 second range.")

    if probe.channels > 1:
        warnings.append("Stereo input detected. It will be converted to mono for cloning.")

    rms = analysis.get("rms_db")
    peak = analysis.get("peak_db")
    silence_total = analysis.get("silence_total_sec", 0.0) or 0.0
    noise_floor = analysis.get("noise_floor_db")
    clipped = analysis.get("clipped_samples", 0) or 0

    if rms is not None and rms < -34:
        warnings.append("Reference is very quiet. Conditioning quality may degrade.")
    if peak is not None and peak >= -0.5:
        warnings.append("Possible clipping/overload detected in the reference.")
    if clipped > 0:
        warnings.append("Clipped samples detected. Distortion can affect cloning quality.")
    if d > 0 and silence_total / d > 0.35:
        warnings.append("Large silence portions detected. Keep mostly voiced audio.")
    if noise_floor is not None and noise_floor > -35:
        warnings.append("Background noise floor appears elevated.")

    recommendations.extend(
        [
            "Best results usually come from 5–15 seconds of clean single-speaker speech.",
            "Avoid music beds, overlapping speakers, and heavy background noise.",
        ]
    )
    return warnings, recommendations


def _calc_normalize_gain_db(rms_db: float | None, peak_db: float | None) -> float:
    target_rms = -20.0
    target_peak = -3.0
    if rms_db is None and peak_db is None:
        return 0.0
    gain_rms = target_rms - rms_db if rms_db is not None else 0.0
    gain_peak = target_peak - peak_db if peak_db is not None else gain_rms
    gain = min(gain_rms, gain_peak)
    if gain > 8.0:
        gain = 8.0
    if gain < -8.0:
        gain = -8.0
    return round(gain, 2)


def _build_filter_chain(opts: PreprocessOptions, analysis: dict[str, Any]) -> tuple[str, bool]:
    filters: list[str] = []
    if opts.trim_silence:
        filters.extend(
            [
                "silenceremove=start_periods=1:start_duration=0.12:start_threshold=-45dB",
                "areverse",
                "silenceremove=start_periods=1:start_duration=0.12:start_threshold=-45dB",
                "areverse",
            ]
        )
    normalization_applied = False
    if opts.normalize:
        gain_db = _calc_normalize_gain_db(analysis.get("rms_db"), analysis.get("peak_db"))
        if abs(gain_db) >= 0.5:
            filters.append(f"volume={gain_db}dB")
            normalization_applied = True
    if opts.light_denoise:
        filters.append("afftdn=nf=-28:nt=w")
    if opts.high_pass:
        filters.append("highpass=f=70")
    if opts.peak_protect:
        filters.append("alimiter=limit=0.98")
    return ",".join(filters), normalization_applied


def preprocess_audio(
    src_path: str | Path,
    out_dir: str | Path,
    options: PreprocessOptions | None = None,
) -> dict[str, Any]:
    src = Path(src_path)
    out_base = Path(out_dir)
    out_base.mkdir(parents=True, exist_ok=True)
    opts = options or PreprocessOptions()

    before_probe = probe_audio(src)
    before_analysis = analyze_signal(src)
    warnings, recommendations = quality_warnings(before_probe, before_analysis)
    af_chain, normalization_applied = _build_filter_chain(opts, before_analysis)

    out_name = f"{src.stem}__processed_{uuid.uuid4().hex[:8]}.wav"
    out_path = out_base / out_name

    cmd = ["ffmpeg", "-hide_banner", "-y", "-i", str(src)]
    if af_chain:
        cmd.extend(["-af", af_chain])
    if opts.force_mono:
        cmd.extend(["-ac", "1"])
    cmd.extend(["-ar", str(opts.target_sr), "-c:a", "pcm_s16le", str(out_path)])
    code, _, err = _run(cmd)
    if code != 0:
        raise RuntimeError(err.strip() or "ffmpeg preprocessing failed")

    after_probe = probe_audio(out_path)
    trim_fallback_applied = False
    if (
        opts.trim_silence
        and before_probe.duration_sec > 0.0
        and after_probe.duration_sec <= max(0.25, before_probe.duration_sec * 0.2)
    ):
        safe_opts = PreprocessOptions(**asdict(opts))
        safe_opts.trim_silence = False
        af_chain_safe, normalization_applied = _build_filter_chain(safe_opts, before_analysis)
        cmd_safe = ["ffmpeg", "-hide_banner", "-y", "-i", str(src)]
        if af_chain_safe:
            cmd_safe.extend(["-af", af_chain_safe])
        if safe_opts.force_mono:
            cmd_safe.extend(["-ac", "1"])
        cmd_safe.extend(["-ar", str(safe_opts.target_sr), "-c:a", "pcm_s16le", str(out_path)])
        code_safe, _, err_safe = _run(cmd_safe)
        if code_safe == 0:
            after_probe = probe_audio(out_path)
            trim_fallback_applied = True
            warnings.append("Silence trim was too aggressive on this clip. Reprocessed without trim.")
        else:
            warnings.append(f"Safe fallback without trim failed: {err_safe.strip() or 'ffmpeg failed'}")

    after_analysis = analyze_signal(out_path)
    trimmed = bool(
        opts.trim_silence
        and not trim_fallback_applied
        and (after_probe.duration_sec + 0.05 < before_probe.duration_sec)
    )

    report = {
        "original": {
            "duration_sec": round(before_probe.duration_sec, 3),
            "sample_rate": before_probe.sample_rate,
            "channels": before_probe.channels,
            "codec": before_probe.codec,
            "bit_rate": before_probe.bit_rate,
            "analysis": before_analysis,
        },
        "processed": {
            "duration_sec": round(after_probe.duration_sec, 3),
            "sample_rate": after_probe.sample_rate,
            "channels": after_probe.channels,
            "codec": after_probe.codec,
            "bit_rate": after_probe.bit_rate,
            "analysis": after_analysis,
        },
        "applied": {
            "force_mono": bool(opts.force_mono),
            "resample": True,
            "target_sr": opts.target_sr,
            "trim_silence": bool(opts.trim_silence),
            "trimmed": trimmed,
            "trim_fallback_applied": trim_fallback_applied,
            "normalize": bool(opts.normalize),
            "normalization_applied": normalization_applied,
            "light_denoise": bool(opts.light_denoise),
            "high_pass": bool(opts.high_pass),
            "peak_protect": bool(opts.peak_protect),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }
    return {
        "output_path": str(out_path),
        "report": report,
        "options": asdict(opts),
    }


def build_passthrough_report(src_path: str | Path, options: PreprocessOptions | None = None) -> dict[str, Any]:
    src = Path(src_path)
    opts = options or PreprocessOptions()
    probe = probe_audio(src)
    analysis = analyze_signal(src)
    warnings, recommendations = quality_warnings(probe, analysis)
    return {
        "output_path": str(src),
        "options": asdict(opts),
        "report": {
            "original": {
                "duration_sec": round(probe.duration_sec, 3),
                "sample_rate": probe.sample_rate,
                "channels": probe.channels,
                "codec": probe.codec,
                "bit_rate": probe.bit_rate,
                "analysis": analysis,
            },
            "processed": {
                "duration_sec": round(probe.duration_sec, 3),
                "sample_rate": probe.sample_rate,
                "channels": probe.channels,
                "codec": probe.codec,
                "bit_rate": probe.bit_rate,
                "analysis": analysis,
            },
            "applied": {
                "force_mono": False,
                "resample": False,
                "target_sr": opts.target_sr,
                "trim_silence": False,
                "trimmed": False,
                "normalize": False,
                "normalization_applied": False,
                "light_denoise": False,
                "high_pass": False,
                "peak_protect": False,
            },
            "warnings": warnings + ["ffmpeg/ffprobe not available. Using original reference audio."],
            "recommendations": recommendations,
        },
    }
