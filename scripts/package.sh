#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_FILE="${ROOT_DIR}/submission.zip"

echo "Building submission package at ${ZIP_FILE}..."

rm -f "${ZIP_FILE}"

# Create zip archive excluding git, node_modules, .env, caches
zip -r "${ZIP_FILE}" \
  src/ \
  tests/ \
  scripts/ \
  config/ \
  pack/ \
  output/ \
  package.json \
  package-lock.json \
  tsconfig.json \
  vitest.config.ts \
  .env.example \
  .gitignore \
  README.md \
  ASSUMPTIONS.md \
  DECISIONS.md \
  plan.md \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*.env" \
  -x "*.cache*" \
  -x "*.vitest*" \
  -x "*coverage*"

ZIP_SIZE=$(stat -c%s "${ZIP_FILE}" 2>/dev/null || stat -f%z "${ZIP_FILE}" 2>/dev/null || wc -c < "${ZIP_FILE}")
ZIP_SIZE_MB=$(echo "scale=2; ${ZIP_SIZE} / 1048576" | bc 2>/dev/null || echo "$((ZIP_SIZE / 1048576))")

echo "=========================================="
echo "Submission package created: ${ZIP_FILE}"
echo "Zip size: ${ZIP_SIZE} bytes (~${ZIP_SIZE_MB} MB)"
echo "=========================================="

