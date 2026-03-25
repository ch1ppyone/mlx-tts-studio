#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT/.venv"

cd "$ROOT"

echo "═══════════════════════════════════════════"
echo "  MLX TTS Studio — install"
echo "═══════════════════════════════════════════"
echo

if [[ "$(uname)" != "Darwin" ]]; then
  echo "⚠  This project requires Apple Silicon Mac with MLX."
  echo "   Detected OS: $(uname). Continuing anyway…"
fi

if ! xcode-select -p &>/dev/null; then
  echo "→ Installing Xcode Command Line Tools…"
  xcode-select --install
  echo "  Re-run this script after installation finishes."
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "✗ python3 not found."
  echo "  Install it: brew install python@3.11"
  exit 1
fi

PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)

if (( PY_MAJOR < 3 || PY_MINOR < 10 )); then
  echo "✗ Python $PY_VER detected. Need 3.10+."
  echo "  Install it: brew install python@3.11"
  exit 1
fi
echo "✓ Python $PY_VER"

if [ ! -d "$VENV_DIR" ]; then
  echo "→ Creating virtual environment…"
  python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
echo "✓ Virtual environment: .venv"

echo "→ Upgrading pip…"
pip install --upgrade pip --quiet

echo "→ Installing dependencies (this may take a few minutes on first run)…"
pip install -r requirements.txt --quiet
echo "✓ All dependencies installed"

echo "→ Verifying mlx-audio…"
python3 -c "import mlx_audio; print('✓ mlx-audio OK')"

cat > "$ROOT/run.sh" << 'RUNEOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
source "$ROOT/.venv/bin/activate"

echo "═══════════════════════════════════════════"
echo "  MLX TTS Studio"
echo "  Press Ctrl+C to stop"
echo "═══════════════════════════════════════════"
echo

python3 "$ROOT/app/app.py"
RUNEOF
chmod +x "$ROOT/run.sh"

echo
echo "═══════════════════════════════════════════"
echo "  ✓ Installation complete!"
echo ""
echo "  To start the server:"
echo "    ./run.sh"
echo ""
echo "  Server auto-picks a free port (default 7860)"
echo "═══════════════════════════════════════════"
