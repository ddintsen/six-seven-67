#!/bin/bash
# Builds the reel. Needs the dev server (npm run dev) and ffmpeg.
#   bash reel/build.sh [stage] [out-dir]
# Stages: sound, 3d, splice, type, mux, all (default: sound, 3d, type, mux).
# The 3D layer renders in segments and resumes after an interruption; the
# type layer and the mux take minutes, so type and timing can change without
# redrawing the 3D (keep the 3D-affecting code in world.ts and main.ts
# untouched, or rebuild 3d).
# splice builds version 2's 3D layer from the first cut's segments (V1_3D,
# rendered on the 60-second clock) plus a fresh four-calls segment, with the
# cleared set of the market list standing in for the two interface shots.
# Do not edit files under reel/ while a stage runs: Vite reloads the page.
set -euo pipefail
cd "$(dirname "$0")/.."
STAGE=${1:-all}
OUT=${2:-/tmp/67-reel}
V1_3D=${V1_3D:-/tmp/67-reel/3d}
mkdir -p "$OUT/3d"

if [[ $STAGE == sound || $STAGE == all ]]; then
  node reel/render.mjs cues --out reel/cues.json
  python3 reel/music.py reel/cues.json "$OUT/music.wav"
fi

if [[ $STAGE == 3d || $STAGE == all ]]; then
  # Film time: the mark, forest, list, ticket, price, calls, claim, code, Gno.land, end.
  for segment in "0 8" "8 12" "12 16" "16 20" "20 32" "32 48" "48 52" "52 56" "56 60" "60 68"; do
    read -r from to <<< "$segment"
    name=$(printf "%02d-%02d" "$from" "$to")
    [[ -f "$OUT/3d/$name.done" ]] && continue
    node reel/render.mjs video --layer 3d --from "$from" --to "$to" --out "$OUT/3d/$name.mkv"
    touch "$OUT/3d/$name.done"
  done
  for file in "$OUT"/3d/*.mkv; do echo "file '$file'"; done > "$OUT/3d/list.txt"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUT/3d/list.txt" -c copy "$OUT/3d.mkv"
fi

if [[ $STAGE == splice ]]; then
  if [[ ! -f "$OUT/3d/32-48.done" ]]; then
    node reel/render.mjs video --layer 3d --from 32 --to 48 --out "$OUT/3d/32-48.mkv"
    touch "$OUT/3d/32-48.done"
  fi
  {
    for name in 00-08 08-12 12-16 12-16 16-28; do echo "file '$V1_3D/$name.mkv'"; done
    echo "file '$OUT/3d/32-48.mkv'"
    for name in 12-16 44-48 48-52 52-60; do echo "file '$V1_3D/$name.mkv'"; done
  } > "$OUT/3d/list.txt"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUT/3d/list.txt" -c copy "$OUT/3d.mkv"
fi

if [[ $STAGE == type || $STAGE == all ]]; then
  node reel/render.mjs video --layer type --out "$OUT/type.mov"
fi

if [[ $STAGE == mux || $STAGE == all ]]; then
  ffmpeg -y -loglevel error -i "$OUT/3d.mkv" -i "$OUT/type.mov" -i "$OUT/music.wav" \
    -filter_complex "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
    -c:v libx264 -preset slow -crf 16 -profile:v high -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT/67-showreel.mp4"
  # Poster: the hero frame, Six. Seven. Take a side.
  ffmpeg -y -loglevel error -ss 7.6 -i "$OUT/67-showreel.mp4" -frames:v 1 "$OUT/67-showreel-poster.png"
  echo "$OUT/67-showreel.mp4"
fi
