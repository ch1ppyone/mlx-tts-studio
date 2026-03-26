#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT/.venv"
W=48

cd "$ROOT"

if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi

echo
echo "  $(printf '=%.0s' $(seq 1 $W))"
echo "    MLX TTS Studio — Install"
echo "  $(printf '=%.0s' $(seq 1 $W))"
echo

# ── Platform check ──────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  echo "  \033[33m⚠  This project is built for Apple Silicon Mac with MLX.\033[0m"
  echo "     Detected OS: $(uname). Continuing anyway…"
  echo
fi

# ── Xcode CLI tools ────────────────────────────────────────────
if ! xcode-select -p &>/dev/null; then
  echo "  → Installing Xcode Command Line Tools…"
  xcode-select --install
  echo
  echo "  \033[33mRe-run this script after Xcode tools finish installing.\033[0m"
  exit 1
fi

# ── Python ──────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "  \033[31m✗ python3 not found.\033[0m"
  echo
  echo "  Install Python 3.10+ with:"
  echo "    brew install python@3.11"
  echo
  exit 1
fi

PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)

if (( PY_MAJOR < 3 || PY_MINOR < 10 )); then
  echo "  \033[31m✗ Python $PY_VER detected — need 3.10+.\033[0m"
  echo
  echo "  Install a newer version:"
  echo "    brew install python@3.11"
  echo
  exit 1
fi
echo "  ✓ Python $PY_VER"

# ── Virtual environment ─────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  echo "  → Creating virtual environment…"
  python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
echo "  ✓ Virtual environment: .venv"

# ── Dependencies ────────────────────────────────────────────────
echo "  → Upgrading pip…"
pip install --upgrade pip --quiet

echo "  → Installing dependencies (this may take a few minutes on first run)…"
pip install -r requirements.txt --quiet
echo "  ✓ All dependencies installed"

# ── Verification ────────────────────────────────────────────────
echo "  → Verifying mlx-audio…"
python3 -c "import mlx_audio; print('  ✓ mlx-audio OK')"

echo "  → Verifying misaki (Kokoro phonemizer)…"
python3 -c "from misaki import en; print('  ✓ misaki OK')" 2>/dev/null || {
  echo "  \033[33m⚠  misaki English module failed — Kokoro may not work.\033[0m"
  echo "     Try: pip install misaki num2words spacy"
}

if command -v espeak-ng &>/dev/null; then
  echo "  ✓ espeak-ng found (extended language support for Kokoro)"
else
  if [ "${MLX_TTS_INSTALL_ESPEAK:-0}" = "1" ]; then
    if command -v brew &>/dev/null; then
      echo "  → Installing espeak-ng via Homebrew…"
      brew install espeak-ng
      echo "  ✓ espeak-ng installed"
    else
      echo "  \033[33m⚠  Homebrew not found, cannot auto-install espeak-ng.\033[0m"
      echo "     Install Homebrew first, then run: brew install espeak-ng"
    fi
  else
    echo "  ℹ  espeak-ng not found — optional for extended Kokoro languages."
    echo "     Install: brew install espeak-ng"
    echo "     Or set MLX_TTS_INSTALL_ESPEAK=1 in .env to auto-install during setup"
  fi
fi

if command -v ffmpeg &>/dev/null && command -v ffprobe &>/dev/null; then
  echo "  ✓ ffmpeg/ffprobe found (reference audio preprocessing enabled)"
else
  echo "  ℹ  ffmpeg/ffprobe not found — preprocessing will run in fallback mode."
  echo "     Install: brew install ffmpeg"
fi

# ── Done ────────────────────────────────────────────────────────
echo
echo "  $(printf '=%.0s' $(seq 1 $W))"
echo "    ✓ Installation complete!"
echo
echo "    Start the app:"
echo "      ./run.sh"
echo
echo "    The browser opens automatically."
echo "    Default port: 7860"
echo "  $(printf '=%.0s' $(seq 1 $W))"
echo
