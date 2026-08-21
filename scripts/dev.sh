#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PY="$ROOT/backend/.venv/bin/python"

if [[ ! -x "$BACKEND_PY" ]]; then
  echo "Backend venv not found at backend/.venv"
  echo "Run setup first:"
  echo "  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Frontend dependencies not installed."
  echo "Run: cd frontend && npm install"
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:8000"
(
  cd "$ROOT/backend"
  PYTHONPATH=. "$BACKEND_PY" -m uvicorn app.api.main:app --reload --port 8000
) &

echo "Starting frontend (Vite dev server)"
(
  cd "$ROOT/frontend"
  npm run dev
) &

wait
