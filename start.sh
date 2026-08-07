#!/bin/bash
set -e

# Resolve the script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend"

echo "Starting 论语圆桌 · 星空圆桌..."
echo "Open http://127.0.0.1:8001 in your browser"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required but not found."
    exit 1
fi

# Start server
exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8001
