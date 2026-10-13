---
title: "test: suíte automatizada com Codecov, Playwright e CI"
---
## Issue

Closes {{ISSUE}}

## O que mudou

- Testes unitários de `util` e `auth` (hash scrypt, limite de tentativas, mutex, datas): **34 testes** no total, **89 % de linhas** em `src/` e `scripts/`.
- `npm test` gera `coverage/lcov.info` com o coverage nativo do Node (sem dependência extra).
- **Playwright** em `e2e/`: fluxo completo (cadastro, casa, bloqueio, convites, proposta, privacidade entre corretores, dupla reserva barrada, aceite, página pública, sessão, logout) e fluxo de administração.
- Workflows: `CI` (lint, arch-contract, knip, commitlint, testes + envio ao **Codecov**, e2e) e `Mutation` (Stryker, toda segunda e sob demanda). `codecov.yml` com meta de 80 %.

## Como verificar

```bash
npm test                  # 34 testes + cobertura
npm install && npm run e2e:install && npm run e2e
```

## Checklist (AGENTS.md §3)

- [x] Critérios de aceite da issue cumpridos (e2e e CI sem execução, ver abaixo)
- [x] Testes novos
- [x] `npm test` passa
- [x] Privacidade entre corretores testada (unidade de API existente + e2e)
- [x] Interface: sem mudança
- [x] Sem segredos (o token do Codecov vem de `secrets.CODECOV_TOKEN`)
- [x] Docs: AGENTS.md já descreve

## Deploy

Nada. Criar o secret `CODECOV_TOKEN` no repositório.

## Não verificado

O registro do npm estava inacessível, então `@playwright/test` não foi instalado e **o `npm run e2e` e os workflows não foram executados**. O roteiro do e2e é o mesmo que foi rodado com sucesso contra o servidor real usando Playwright para Python (14 etapas, sem erros de console), mas esta versão em JavaScript ainda precisa da primeira execução no CI. `fail_ci_if_error: false` no Codecov evita falha por token ausente na primeira vez.
