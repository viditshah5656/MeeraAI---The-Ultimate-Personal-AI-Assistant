#!/bin/bash
set -e

# Make sure we are in the project root
cd "$(dirname "$0")/.."

echo "Starting MeeraAI..."

# Start the frontend
cd desktop_frontend
npm run dev
