import os
from pathlib import Path

VERSION = "1.0.0"

HOST = os.environ.get("MLX_TTS_HOST", "0.0.0.0")
PORT = int(os.environ.get("MLX_TTS_PORT", "7860"))
PORT_RANGE = int(os.environ.get("MLX_TTS_PORT_RANGE", "10"))
AUDIO_TTL = int(os.environ.get("MLX_TTS_AUDIO_TTL", "7200"))
TEMP_DIR = os.environ.get("MLX_TTS_TEMP_DIR", "")
PREVIEW_TEXT = os.environ.get(
    "MLX_TTS_PREVIEW_TEXT",
    "Hello! This is a preview of how I sound.",
)
MAX_AUDIO_STORE = int(os.environ.get("MLX_TTS_MAX_AUDIO", "200"))
AUTO_OPEN_BROWSER = os.environ.get("MLX_TTS_NO_BROWSER", "") != "1"

APP_DIR = Path(__file__).parent
STATIC_DIR = APP_DIR / "static"
REF_DIR = Path(
    os.environ.get(
        "MLX_TTS_REF_DIR",
        str(Path.home() / ".mlx-tts-studio" / "refs"),
    )
)

_hf_home = Path(os.environ.get("HF_HOME", str(Path.home() / ".cache" / "huggingface")))
HF_CACHE_DIR = Path(os.environ.get("HUGGINGFACE_HUB_CACHE", str(_hf_home / "hub")))
