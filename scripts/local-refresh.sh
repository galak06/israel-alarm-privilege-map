#!/bin/bash
# Hourly data refresh — run from local machine (bypasses Oref IP blocks)
# Fetches fresh alert data, commits, and pushes → triggers GitHub Actions deploy

set -e
cd "$(dirname "$0")/.."

# Load env vars if .env.local exists
[ -f .env.local ] && export $(grep -v '^#' .env.local | xargs)

echo "$(date): Starting local refresh..."

node scripts/fetch-localities.mjs

git add public/localities.json scripts/alerts-cache.json
if git diff --staged --quiet; then
  echo "$(date): No changes — skipping commit"
else
  git commit -m "chore: refresh alert data [skip ci]"
  git pull --rebase origin main
  git push
  echo "$(date): Pushed — GitHub Actions will build and deploy"
fi
