#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -d node_modules ]]; then
  npm ci
fi
if [[ ! -d web/node_modules ]]; then
  npm --prefix web ci
fi
if [[ ! -f web/.next/BUILD_ID ]]; then
  npm run build
fi
open http://localhost:4310
exec npm start
