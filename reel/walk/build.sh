#!/usr/bin/env bash
# Builds the walkthrough film. Needs the dev server (npm run dev) on port 6767.
#   bash reel/walk/build.sh all            record, type, sound, mux
#   bash reel/walk/build.sh record|type|sound|mux|poster
# Layers go to reel/walk/out/ (ignored by git); the film to previews/reel/.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=reel/walk/out
FILM=previews/reel/67-walkthrough.mp4
export REEL_URL=http://127.0.0.1:6767/reel/walk/index.html
mkdir -p "$OUT" previews/reel

record() { WALK_OUT="$OUT" npx playwright test -c reel/walk/pw.config.ts; }
type_layer() {
  node reel/render.mjs cues --out reel/walk/cues.json
  node reel/render.mjs video --layer type --out "$OUT/type.mov"
}
sound() { python3 reel/walk/music.py reel/walk/cues.json reel/walk/record.json "$OUT/score.wav"; }
mux() {
  # The film's ground, the recorded interface in its window, the type layer on top.
  ffmpeg -y -loglevel error -i "$OUT/screen.mp4" -i "$OUT/type.mov" -i "$OUT/score.wav" -filter_complex \
    "color=c=0x141A18:s=1920x1080:r=30:d=52[bg];[bg][0:v]overlay=600:48:eof_action=pass[a];[a][1:v]overlay=0:0:format=auto,format=yuv420p[v]" \
    -map '[v]' -map 2:a -c:v libx264 -preset slow -crf 16 -c:a aac -b:a 192k -movflags +faststart -t 52 "$FILM"
  ffprobe -v error -show_entries format=duration,size -of compact "$FILM"
}
poster() { ffmpeg -y -loglevel error -ss 1.6 -i "$FILM" -frames:v 1 previews/reel/67-walkthrough-poster.png; }

case "${1:-all}" in
  record) record ;; type) type_layer ;; sound) sound ;; mux) mux ;; poster) poster ;;
  all) record; type_layer; sound; mux; poster ;;
esac
