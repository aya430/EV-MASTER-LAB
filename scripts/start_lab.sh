#!/usr/bin/env bash
# EV MASTER LAB - local launcher (Linux/macOS). Developed by Dr Bansilal Bairwa, REVA University.
cd "$(dirname "$0")/.."
echo "EV MASTER LAB running at http://localhost:8080  (Ctrl+C to stop)"
( sleep 1; xdg-open http://localhost:8080/index.html 2>/dev/null || open http://localhost:8080/index.html ) &
python3 -m http.server 8080
