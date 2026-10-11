---
title: "Observabilidade: Sentry, OpenTelemetry, Datadog e New Relic"
type: nova função
branch: feat/observability
phase: agora
---
## Contexto
Em produção só saberemos de erro e lentidão quando alguém reclamar. Precisamos de logs, métricas, traces e captura de erros, sem prender o projeto a um fornecedor.

## Critérios de aceite
- [ ] Logs JSON estruturados com `reqId`, rota, status e duração, sem dados pessoais
- [ ] `GET /metrics` (Prometheus) protegido por `METRICS_TOKEN`
- [ ] Sentry no servidor (`SENTRY_DSN`) e erros do navegador enviados por `POST /api/telemetry/error`
- [ ] OpenTelemetry por OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`); Datadog e New Relic ativados só por variáveis, documentado
- [ ] Tudo opcional: sem variáveis, o servidor roda normal
- [ ] Testes cobrindo métricas, sanitização e o endpoint de erro

## Fora do escopo
Dashboards e alertas (dependem do fornecedor escolhido).
