#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
 echo 'Install Node.js 22 or newer first.'
 read -r
 exit 1
fi
npm ci --omit=dev || exit 1
node install-launcher.mjs
read -r '?Press Enter to close.'
