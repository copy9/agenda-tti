---
title: "docs: padrão de trabalho com issues, branches e PRs"
---
## Issue

Closes {{ISSUE}}

## O que mudou

Registra o fluxo obrigatório (issue → branch → PR → deploy) em `AGENTS.md`, para que qualquer agente ou pessoa siga o mesmo padrão. Inclui modelos de issue (Correção, Melhoria, Nova função) e de PR, o workflow `PR policy` (exige `Closes #N` e título em Conventional Commits), ganchos de commit sem dependências e o script que publica issues e PRs a partir de `docs/`.

## Como verificar

- Ler `AGENTS.md`.
- `node scripts/check-commit-msg.js` com mensagens boas e ruins.
- `npm run publish:github -- dono/repo --dry-run` lista o que seria criado.
- Abrir um PR sem `Closes #N`: o check `PR policy` deve reprovar.

## Checklist (AGENTS.md §3)

- [x] Critérios de aceite da issue cumpridos
- [x] Testes novos ou ajustados (validador de commit)
- [ ] `npm run check` passa (ainda não existe; chega em #qualidade)
- [x] Privacidade entre corretores: sem mudança de código
- [x] Interface: sem mudança
- [x] Sem segredos nem dados reais
- [x] Docs atualizadas

## Deploy

Nada. Depois do merge, configurar à mão a proteção da `main` (exigir PR, CI verde, squash).

## Não verificado

O workflow `PR policy` e o script `publish:github` (sem `--dry-run`) só podem ser exercitados com o GitHub conectado.
