#!/usr/bin/env bash
# Roda um comando no CI e, se falhar, publica o final da saída como anotação (visível na página do PR e na API).
# Uso: scripts/ci-run.sh "Título" comando args...
title="$1"; shift
log="$(mktemp)"
"$@" >"$log" 2>&1; code=$?
cat "$log"
if [ "$code" -ne 0 ]; then
  # O GitHub corta anotações longas (~4 mil caracteres): manda em pedaços numerados.
  sed 's/\x1b\[[0-9;]*m//g' "$log" | head -c 30000 | python3 -c "
import sys
t = sys.stdin.read()
enc = lambda x: x.replace('%', '%25').replace('\r', '').replace('\n', '%0A')
parts = [t[i:i + 3500] for i in range(0, len(t), 3500)] or ['']
for n, c in enumerate(parts, 1):
    print('::error title=${title} falhou (código ${code}), parte %d de %d::%s' % (n, len(parts), enc(c)))
"
fi
exit "$code"
