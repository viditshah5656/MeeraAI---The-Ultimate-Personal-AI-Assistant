#!/usr/bin/env bash
set -euo pipefail

# Prepend Homebrew paths so Brew-installed python/pip are found first
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

INSTALL_ROOT="${1:-}"
RUNTIME_ROOT="${2:-}"

if [[ -z "${INSTALL_ROOT}" || -z "${RUNTIME_ROOT}" ]]; then
  echo "[MeeraAI] usage: install-backend-mac.sh <install-root> <runtime-root>" >&2
  exit 1
fi

log_step() {
  echo "[MeeraAI] $1"
}

# Require python3 >= 3.10
if ! command -v python3 >/dev/null 2>&1; then
  echo "[MeeraAI] python3 not found. Please install Python 3.10+ (for example: 'brew install python' or download from https://www.python.org/downloads/)." >&2
  exit 1
fi

PYTHON_BIN="python3"
if ! ${PYTHON_BIN} -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "[MeeraAI] Python 3.10 or newer is required. Install via Homebrew (brew install python@3.11) or https://www.python.org/downloads/." >&2
  exit 1
fi

# Locate requirements file
REQUIREMENTS_PATH="${INSTALL_ROOT}/scripts/requirements-backend-remote-mac.txt"
if [[ ! -f "${REQUIREMENTS_PATH}" ]]; then
  REQUIREMENTS_PATH="$(cd "$(dirname "$0")" && pwd)/requirements-backend-remote-mac.txt"
fi
if [[ ! -f "${REQUIREMENTS_PATH}" ]]; then
  echo "[MeeraAI] requirements-backend-remote-mac.txt was not found." >&2
  exit 1
fi

VENV_DIR="${RUNTIME_ROOT}/venv"
if [[ ! -d "${VENV_DIR}" ]]; then
  log_step "Creating virtual environment at ${VENV_DIR}..."
  ${PYTHON_BIN} -m venv "${VENV_DIR}"
fi
VENV_PYTHON="${VENV_DIR}/bin/python3"

log_step "Upgrading pip..."
"${VENV_PYTHON}" -m pip install --upgrade pip

log_step "Installing backend requirements from ${REQUIREMENTS_PATH}..."
"${VENV_PYTHON}" -m pip install -r "${REQUIREMENTS_PATH}"

log_step "Installing Playwright browsers (chromium)..."
"${VENV_PYTHON}" -m playwright install chromium

log_step "Verifying document OCR support..."
"${VENV_PYTHON}" -c 'import fitz; from rapidocr_onnxruntime import RapidOCR; print("OCR ready:", RapidOCR.__module__)'

# Create runtime root and atomic sentinel
mkdir -p "${RUNTIME_ROOT}"
# touch after ensuring directory exists (atomicity via directory creation + touch)
touch "${RUNTIME_ROOT}/.backend-ready"

log_step "MeeraAI remote backend is ready."
exit 0
