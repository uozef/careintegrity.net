#!/bin/bash
set -e

echo "Starting NDIS Fraud Detection in DEV mode..."
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Backend setup
cd "$PROJECT_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# Start backend in background
echo "Starting backend on :8000..."
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Frontend setup + dev server
cd "$PROJECT_DIR/frontend"
npm install --silent 2>/dev/null

echo "Starting frontend dev server on :5173..."
echo ""
echo "=========================================="
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo "=========================================="
echo ""

npm run dev

# Cleanup
kill $BACKEND_PID 2>/dev/null
