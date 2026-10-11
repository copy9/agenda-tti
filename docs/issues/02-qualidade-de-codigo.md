---
title: "Qualidade de código: Biome, Commitlint, Knip, Stryker e arch-contract"
type: melhoria
branch: chore/code-quality
phase: agora
---
## Contexto
Sem lint, formatação, checagem de código morto, regras de arquitetura e teste de mutação, a qualidade depende de revisão manual.

## Critérios de aceite
- [ ] Biome configurado (lint + formatação) e script `npm run lint`
- [ ] Commitlint (conventional) no commit-msg e no CI
- [ ] Knip configurado para achar código e dependências sem uso
- [ ] `scripts/arch-contract.js` aplica as regras de camadas de `AGENTS.md` §6, com testes
- [ ] Stryker configurado para o servidor (`npm run mutation`)
- [ ] `npm run check` roda tudo que for rápido

## Fora do escopo
Reformatar todo o código existente de uma vez (feito em PR próprio, depois que o Biome rodar no CI).
