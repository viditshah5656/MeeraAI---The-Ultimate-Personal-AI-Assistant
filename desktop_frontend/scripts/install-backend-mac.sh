#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${1:-}"
RUNTIME_ROOT="${2:-}"

if [[ -z "${INSTALL_ROOT}" || -z "${RUNTIME_ROOT}" ]]; then
  echo "[MeeraAI] usage: install-backend-mac.sh <install-root> <runtime-root>" >&2
  exit 1
fi

log_step() {
  echo "[MeeraAI] $1"
}

resolve_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' "python"
    return 0
  fi
  return 1
}

PYTHON_BIN="$(resolve_python || true)"
if [[ -z "${PYTHON_BIN}" ]]; then
  echo "[MeeraAI] Python 3 is required to prepare the backend." >&2
  exit 1
fi

REQUIREMENTS_PATH="${INSTALL_ROOT}/scripts/requirements-backend-remote-mac.txt"
if [[ ! -f "${REQUIREMENTS_PATH}" ]]; then
  REQUIREMENTS_PATH="$(cd "$(dirname "$0")" && pwd)/requirements-backend-remote-mac.txt"
fi
if [[ ! -f "${REQUIREMENTS_PATH}" ]]; then
  echo "[MeeraAI] requirements-backend-remote-mac.txt was not found." >&2
  exit 1
fi

mkdir -p "${RUNTIME_ROOT}"
VENV_PATH="${RUNTIME_ROOT}/venv"
VENV_PYTHON="${VENV_PATH}/bin/python3"

if [[ ! -x "${VENV_PYTHON}" ]]; then
  log_step "Creating backend virtual environment..."
  "${PYTHON_BIN}" -m venv "${VENV_PATH}"
fi

log_step "Upgrading pip tooling..."
"${VENV_PYTHON}" -m pip install --upgrade pip wheel

log_step "Installing MeeraAI remote backend dependencies..."
"${VENV_PYTHON}" -m pip install --upgrade -r "${REQUIREMENTS_PATH}"

VERIFY_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/meera-verify-remote-XXXXXX.py")"
cat > "${VERIFY_SCRIPT}" <<'PY'
import sambanova
import fastapi
import uvicorn

print("sambanova", getattr(sambanova, "__version__", "unknown"))
print("fastapi", getattr(fastapi, "__version__", "unknown"))
print("uvicorn", getattr(uvicorn, "__version__", "unknown"))
PY

trap 'rm -f "${VERIFY_SCRIPT}"' EXIT

log_step "Verifying remote backend dependencies..."
"${VENV_PYTHON}" "${VERIFY_SCRIPT}"

log_step "MeeraAI remote backend is ready."
