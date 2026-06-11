#!/bin/sh
# Typography gate: ban arbitrary px font sizes (`text-[13px]`, `text-[10px]`, …).
# Font sizes must stay on the governed Tailwind scale (text-xs/sm/base/lg/xl) so the
# UI keeps a single, consistent type ramp. See docs/ai/conventions.md → Typography.
# Never bypass with --no-verify — swap the arbitrary value for a scale step.
#
# Scope: tracked .tsx/.ts/.jsx/.js/.css under apps/ and packages/ (docs excluded so
# this file and conventions.md can name the banned pattern without self-tripping).
set -eu

matches="$(git grep -nE 'text-\[[0-9]+px\]' -- apps packages 2>/dev/null \
  | grep -E '^[^:]+\.(tsx?|jsx?|css):' || true)"

if [ -n "$matches" ]; then
  echo "typography gate: arbitrary px font sizes are banned — use text-xs/sm/base/lg/xl:" >&2
  printf '%s\n' "$matches" | sed 's/^/  - /' >&2
  exit 1
fi

exit 0
