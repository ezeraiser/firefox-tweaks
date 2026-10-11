#!/bin/bash
# usage: batch.sh rounds label:arg ...   (label "base" = no extra args)
E="C:/Code/helium-win/build/src/out/Default/chrome.exe"
R=$1; shift
for r in $(seq 1 $R); do
  for c in "$@"; do
    l="${c%%:*}"; a="${c#*:}"
    if [ "$c" = "$l" ]; then node speedo.mjs "$E" "$l" 1; else node speedo.mjs "$E" "$l" 1 -- "$a"; fi
  done
done
