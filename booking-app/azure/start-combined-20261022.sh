#!/bin/sh
set -eu
export NODE_ENV=production
cd /home/data
sha256sum -c booking-combined-runtime-20261022-a1c6b401.sha256
release_dir=/tmp/booking-combined-20261022-a1c6b401
mkdir -p "$release_dir"
tar -xzf /home/data/booking-combined-runtime-20261022-a1c6b401.tgz -C "$release_dir"
cd "$release_dir"
exec node azure/server.mjs
