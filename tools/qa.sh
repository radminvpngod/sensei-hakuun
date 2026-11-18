#!/bin/bash
# Runs the playtester and beauty bots headless (cloud or Linux) and prints a compact summary.
# Usage: bash tools/qa.sh            → writes /tmp/playtest/* and /tmp/beauty/* (contact.jpg = one image to review)
cd "$(dirname "$0")/.." || exit 1
if ! command -v xvfb-run >/dev/null; then (sudo -n true 2>/dev/null && S=sudo) ; $S apt-get update -qq >/dev/null 2>&1; $S apt-get install -y -qq xvfb xauth libnss3 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2t64 libasound2 libxss1 libxshmfence1 fonts-noto-cjk >/dev/null 2>&1; fi
mkdir -p /tmp/qa-electron && cd /tmp/qa-electron && [ -x node_modules/electron/dist/electron ] || npm i --silent --no-audit --no-fund electron@33.4.11 >/dev/null 2>&1; cd - >/dev/null
E=/tmp/qa-electron/node_modules/electron/dist/electron; [ -x "$E" ] || { echo "QA: could not install electron"; exit 2; }
rm -rf /tmp/playtest /tmp/beauty
timeout 900 xvfb-run -a -s "-screen 0 1400x900x24" "$E" --no-sandbox tools/playtest.js >/tmp/qa-play.log 2>&1
timeout 500 xvfb-run -a -s "-screen 0 1400x900x24" "$E" --no-sandbox tools/beauty.js >/tmp/qa-beauty.log 2>&1
echo "=== PLAYTEST ==="; cat /tmp/playtest/report.md 2>/dev/null || { echo "playtest failed:"; tail -5 /tmp/qa-play.log; }
echo; echo "=== BEAUTY ==="; python3 -c "
import json; d=json.load(open('/tmp/beauty/beauty.json'))
for v in d['views']: print(f\"{v['name']:<22} {('day' if v['hour']<17 else 'dusk'):<5} lum {v['lum']:.2f} contrast {v['contrast']:.2f} sat {v['sat']:.2f}\", ('· '+', '.join(v['flags'])) if v['flags'] else '')
print('crowded:', d['layout']['crowded'] or 'none'); print('overlaps:', d['layout']['overlaps'][:8] or 'none'); print('script errors:', d['scriptErrors'] or 'none')" 2>/dev/null || { echo "beauty failed:"; tail -5 /tmp/qa-beauty.log; }
echo; echo "contact sheet: /tmp/beauty/contact.jpg"
