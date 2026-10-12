---
title: "Padrão de trabalho: issues, branches, PRs e AGENTS.md"
type: melhoria
branch: docs/work-standard
phase: agora
---
## Contexto
Hoje não há regra escrita de como trabalhar. Qualquer agente ou pessoa precisa seguir o mesmo caminho: issue → branch → PR que menciona a issue → deploy a partir da `main`.

## Critérios de aceite
- [ ] `AGENTS.md` descreve fluxo, tipos de tarefa (Correção, Melhoria, Nova função), commits, PRs, movimento, observabilidade, qualidade e testes
- [ ] `CLAUDE.md` e `.github/copilot-instructions.md` apontam para o `AGENTS.md`
- [ ] Modelos de issue (3 tipos) e de PR em `.github/`
- [ ] Workflow `PR policy` reprova PR sem `Closes #N`/`Refs #N` ou com título fora do padrão
- [ ] Ganchos de commit (`.githooks`) validam Conventional Commits
- [ ] Script `publish:github` cria labels, issues e PRs a partir de `docs/`

## Fora do escopo
Regras de proteção de branch (configuradas à mão no GitHub: exigir PR, CI verde e squash).
