#!/bin/bash
set -e

echo "=========================================="
echo "  NDIS Fraud Detection System"
echo "  Network Integrity Graph +"
echo "  Behavioural Drift Engine"
echo "=========================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is required. Install it first."
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "ERROR: node is required. Install it first."
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Backend setup
echo "[1/4] Setting up Python backend..."
cd "$PROJECT_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# Frontend setup
echo "[2/4] Installing frontend dependencies..."
cd "$PROJECT_DIR/frontend"
npm install --silent 2>/dev/null

# Build frontend
echo "[3/4] Building frontend..."
npm run build

# Start backend (serves both API + built frontend)
echo "[4/4] Starting server..."
echo ""
echo "=========================================="
echo "  System running at http://localhost:8000"
echo "  API docs at http://localhost:8000/docs"
echo "=========================================="
echo ""
cd "$PROJECT_DIR/backend"
source venv/bin/activate
python -m uvicorn app:app --host 0.0.0.0 --port 8000
