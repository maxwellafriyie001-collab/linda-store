#!/bin/bash
# Keeps the Linda app and Cloudflare quick tunnel alive. Run: nohup scripts/supervise.sh >/dev/null 2>&1 &
cd /workspace/linda
( while true; do NODE_ENV=${APP_ENV:-development} node server.js >> app.log 2>&1; echo "app exited $(date)" >> app.log; sleep 2; done ) &
[ "$TUNNEL" = 1 ] && ( while true; do bin/cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:8080 >> tunnel.log 2>&1; echo "tunnel exited $(date)" >> tunnel.log; sleep 5; done ) &
( while true; do u=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' tunnel.log | tail -1); [ -n "$u" ] && echo "$u" > tunnel-url.txt; sleep 10; done ) &
wait
