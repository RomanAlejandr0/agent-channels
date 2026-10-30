#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -d node_modules ]]; then
  npm ci
fi
open http://localhost:4310
exec npm start
