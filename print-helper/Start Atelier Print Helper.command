#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22 or newer, then open this launcher again."
  read -r
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --omit=dev || exit 1
fi
exec node control.mjs
