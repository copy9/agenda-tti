#!/usr/bin/env bash
# Roda um comando no CI e, se falhar, publica o final da saída como anotação (visível na página do PR e na API).
# Uso: scripts/ci-run.sh "Título" comando args...
title="$1"; shift
log="$(mktemp)"
"$@" >"$log" 2>&1; code=$?
cat "$log"
if [ "$code" -ne 0 ]; then
  msg="$(sed 's/\x1b\[[0-9;]*m//g' "$log" | head -c 15000 | python3 -c "import sys; print(sys.stdin.read().replace('%','%25').replace('\r','').replace('\n','%0A'))")"
  echo "::error title=${title} falhou (código ${code})::${msg}"
fi
exit "$code"
