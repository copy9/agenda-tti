---
title: "feat(observability): logs JSON, métricas Prometheus, Sentry e OpenTelemetry"
---
## Issue

Closes {{ISSUE}}

## O que mudou

- `src/telemetry.js` (nova camada, coberta pelo arch-contract):
  - **logs JSON** com `reqId`, rota, status e duração; chaves sensíveis (senha, token, cookie, e-mail, WhatsApp, texto de conversa) removidas e e-mails em texto mascarados;
  - **métricas Prometheus** (requisições por rota/status, histograma de duração, erros, memória, atraso do event loop, Web Vitals) em `GET /metrics`, protegido por `METRICS_TOKEN`;
  - **Sentry** e **OpenTelemetry** carregados só se configurados e instalados; Datadog e New Relic entram pelo OTLP, só com variáveis (README §9).
- `X-Request-Id` em toda resposta; erros 500 passam por `captureException`.
- `POST /api/telemetry/error` e `/api/telemetry/vitals`: o navegador reporta erros e LCP/CLS/FCP/TTFB (com limite por IP e sanitização). O front (modo servidor) já envia.
- `.env.example`, README e `Dockerfile` (`--build-arg OBSERVABILITY=1` instala os SDKs).
- 14 testes novos (unidade e integração): **48 testes** no total.

## Como verificar

```bash
npm test
METRICS_TOKEN=abc npm start
curl -H "Authorization: Bearer abc" localhost:3000/metrics | head -30
```
Roteiro e2e completo (14 etapas) rodado contra o servidor com esta branch, sem erros de console.

## Checklist (AGENTS.md §3)

- [x] Critérios de aceite da issue cumpridos
- [x] Testes novos
- [x] `npm test` e `npm run arch` passam
- [x] Privacidade: logs não trazem dados pessoais (testado)
- [x] Interface: sem mudança visual
- [x] Sem segredos
- [x] Docs atualizadas

## Deploy

Variáveis novas (todas opcionais): `LOG_LEVEL`, `METRICS_TOKEN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `RELEASE`, `TRACES_SAMPLE_RATE`, `OTEL_*`. Rollback: remover as variáveis.

## Não verificado

O registro do npm estava inacessível: **os SDKs do Sentry e do OpenTelemetry nunca foram instalados nem exercitados**, só o caminho "sem SDK" (que é testado). A integração com Sentry/OTel/Datadog/New Relic precisa de uma primeira conferência com as credenciais reais. Os nomes de pacote e os endpoints OTLP seguem a documentação dos fornecedores, sem teste ao vivo.
