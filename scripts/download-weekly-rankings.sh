#!/usr/bin/env bash
set -euo pipefail

BASE="https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main"
OUT="${1:-$HOME/tennis-data/rankings/raw}"
mkdir -p "$OUT"
MANIFEST="$OUT/SHA256SUMS.txt"
: > "$MANIFEST"

files=(
  "atp/atp_rankings_70s.csv"
  "atp/atp_rankings_80s.csv"
  "atp/atp_rankings_90s.csv"
  "atp/atp_rankings_00s.csv"
  "atp/atp_rankings_10s.csv"
  "atp/atp_rankings_20s.csv"
  "atp/atp_rankings_current.csv"
  "wta/wta_rankings_80s.csv"
  "wta/wta_rankings_90s.csv"
  "wta/wta_rankings_00s.csv"
  "wta/wta_rankings_10s.csv"
  "wta/wta_rankings_20s.csv"
  "wta/wta_rankings_current.csv"
)

for rel in "${files[@]}"; do
  name="${rel##*/}"
  dest="$OUT/$name"
  url="$BASE/$rel"
  echo "Downloading $name"
  curl --fail --location --retry 3 --retry-delay 2 --continue-at - "$url" --output "$dest"
  test -s "$dest"
  sha256sum "$dest" >> "$MANIFEST"
done

{
  echo "source=$BASE"
  echo "retrieved_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "license=CC BY-NC-SA 4.0"
  echo "attribution=Jeff Sackmann; archival mirror Aneeshers/tennis-sackmann-archive"
} > "$OUT/SOURCE.txt"

echo
echo "Ranking files downloaded to: $OUT"
echo "Checksums: $MANIFEST"
echo "Next: node ~/tennis-value-scanner/scripts/tennis-dataset-audit.mjs $OUT/*.csv"
