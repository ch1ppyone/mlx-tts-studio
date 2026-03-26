#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT/.venv"

if [ ! -d "$VENV_DIR" ]; then
  echo
  echo "  Virtual environment not found."
  echo "  Run the installer first:"
  echo
  echo "    bash install.sh"
  echo
  exit 1
fi

source "$VENV_DIR/bin/activate"
exec python3 "$ROOT/app/app.py" "$@"
