#!/usr/bin/env bash
# Regenerate shared/types/api.gen.ts against a running backend and fail
# if the working tree changes. Used by CI to catch FE/BE drift; also
# runnable locally as a self-check.
#
# Assumes:
# - backend reachable at $BACKEND_URL (default http://localhost:8000)
# - run from the frontend repo root (cwd contains package.json)
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"

if ! curl -fsS -o /dev/null "${BACKEND_URL}/openapi.json"; then
  echo "ERROR: backend ${BACKEND_URL}/openapi.json is not reachable" >&2
  exit 1
fi

BACKEND_URL="$BACKEND_URL" npx openapi-typescript "${BACKEND_URL}/openapi.json" -o shared/types/api.gen.ts >/dev/null

if ! git diff --exit-code -- shared/types/api.gen.ts; then
  echo "" >&2
  echo "ERROR: shared/types/api.gen.ts is out of sync with the backend OpenAPI schema." >&2
  echo "Run 'npm run gen:types' against a running backend and commit the diff." >&2
  exit 1
fi

echo "api.gen.ts is in sync with ${BACKEND_URL}"
