#!/bin/bash
set -e

echo "Setting up MeeraAI on macOS..."

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "Homebrew is not installed. Please install Homebrew first:"
    echo "/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

# Avoid interactive prompts from brew
export HOMEBREW_NO_ENV_HINTS=1
export HOMEBREW_NO_INTERACTIVE=1

echo "Installing system dependencies..."
echo "Continuing... (assuming node and python3.11 are already installed)"

echo "Setting up backend virtual environment..."
if [ ! -d "venv" ]; then
    python3.11 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip

echo "Installing backend requirements..."
pip install -r desktop_frontend/scripts/requirements-backend-remote-mac.txt

echo "Setting up frontend..."
cd desktop_frontend
npm install

echo "Setup complete!"
echo "Run ./scripts/run-mac.sh to start the application."
