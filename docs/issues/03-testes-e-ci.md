---
title: "Testes unitários, integração e end-to-end com Codecov e CI"
type: nova função
branch: test/automated-suite
phase: agora
---
## Contexto
Existem 14 testes de API. Faltam testes unitários, medição de cobertura, e2e no navegador e um pipeline que rode tudo em cada PR.

## Critérios de aceite
- [ ] Testes unitários de `util`, `auth` (hash/limite) e do `check-commit-msg`
- [ ] Cobertura gerada em `coverage/lcov.info` e enviada ao Codecov no CI
- [ ] Playwright em `e2e/` cobrindo: cadastro, casa, convite, proposta, aceite, dupla reserva barrada, privacidade entre corretores, página pública, admin
- [ ] Workflow de CI: lint, arch, knip, testes, e2e, e (agendado) mutação
- [ ] `codecov.yml` com metas de cobertura

## Fora do escopo
Testes visuais por captura de tela.
