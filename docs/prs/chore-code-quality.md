---
title: "chore: qualidade de código (Biome, Commitlint, Knip, Stryker, arch-contract)"
---
## Issue

Closes {{ISSUE}}

## O que mudou

- `scripts/arch-contract.js`: regras de camadas do servidor (ex.: `util` não importa nada do app; só `db` carrega `mysql2` e `node:sqlite`; front sem `eval`), com testes.
- Configuração do **Biome** (lint), **Commitlint**, **Knip** e **Stryker** (mutação em `policy`, `views`, `store`, `util`).
- Scripts `lint`, `arch`, `knip`, `mutation`, `check` e `check:fast` (usado no pre-commit).
- Testes unitários do arch-contract e do validador de commits (`npm test` agora roda `test/**/*.test.js`: 24 testes).

## Como verificar

```bash
npm run arch      # arch-contract OK
npm test          # 24 testes passando
npm install && npm run lint && npm run knip   # depois de instalar as devDependencies
```

## Checklist (AGENTS.md §3)

- [x] Critérios de aceite da issue cumpridos (configs presentes; execução do Biome/Knip/Stryker pendente, ver abaixo)
- [x] Testes novos
- [x] `npm run arch` e `npm test` passam
- [x] Privacidade entre corretores: sem mudança de código
- [x] Interface: sem mudança
- [x] Sem segredos
- [x] Docs atualizadas (AGENTS.md já descreve)

## Deploy

Nada. Só devDependencies.

## Não verificado

O registro do npm estava inacessível onde o código foi escrito. **Biome, Commitlint, Knip e Stryker não foram executados.** As versões em `devDependencies` são faixas (`^2`, `^19`, `^5`, `^9`) a confirmar no primeiro `npm install`. O formatador do Biome ficou desligado de propósito: ligar e reformatar o código existente é uma issue separada. Se o `biome check` apontar regras recomendadas no código atual, ajustar aqui antes do merge.
