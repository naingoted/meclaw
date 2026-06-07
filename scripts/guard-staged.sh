#!/bin/sh
set -eu

MAX_FILE_SIZE_BYTES=1048576

violations="$(mktemp)"
staged_paths="$(mktemp)"
trap 'rm -f "$violations" "$staged_paths"' EXIT HUP INT TERM

git diff --cached --name-only --diff-filter=ACM --no-renames -z >"$staged_paths"
if [ ! -s "$staged_paths" ]; then
  exit 0
fi

xargs -0 -n 1 sh -c '
violations="$1"
max_file_size_bytes="$2"
shift 2

for file do
  [ -n "$file" ] || continue
  git cat-file -e ":0:$file" || continue

  case "$file" in
    *.pem | *.key | *.p12 | *.pfx | id_rsa | */id_rsa | id_ed25519 | */id_ed25519)
      printf "%s\n" "secret filename: $file" >>"$violations"
      ;;
  esac

  case "$file" in
    *.env.example | *.env.*.example)
      ;;
    *.env | *.env.*)
      printf "%s\n" "environment file: $file" >>"$violations"
      ;;
  esac

  staged_size="$(git cat-file -s ":0:$file")"
  if [ "$staged_size" -gt "$max_file_size_bytes" ]; then
    printf "%s\n" "large staged file: $file (${staged_size} bytes; max ${max_file_size_bytes})" >>"$violations"
  fi

  if git grep -I -n -e "^<<<<<<< " -e "^=======$" -e "^>>>>>>> " --cached -- "./$file" >/dev/null; then
    printf "%s\n" "merge conflict marker in staged content: $file" >>"$violations"
  fi
done
' sh "$violations" "$MAX_FILE_SIZE_BYTES" <"$staged_paths"

if [ -s "$violations" ]; then
  echo "guard-staged: refusing commit because staged files failed safety checks:" >&2
  sed 's/^/  - /' "$violations" >&2
  exit 1
fi

exit 0
