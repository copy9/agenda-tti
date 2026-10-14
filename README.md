# Agenda TTI — Servidor

Servidor completo da Agenda TTI: contas (proprietário, corretor e administrador), casas e fotos, calendário de bloqueios, convites, propostas, conversas, avisos, página pública da casa e painel de administração. O site (front) já vem pronto em `public/index.html` e é entregue pelo próprio servidor. **Não precisa de mais nada além deste projeto.**

- Node 22 ou mais novo, **sem dependências** para rodar com SQLite. `mysql2` só é usado se você configurar MySQL.
- Banco: SQLite (um arquivo, ótimo para começar) ou MySQL/MariaDB (ex.: Hostinger).
- Senhas com scrypt, sessão por cookie `HttpOnly`, limite de tentativas de login, proteção contra CSRF e HTML injetado.

## 1. Rodar no seu computador (teste rápido)

```bash
cp .env.example .env        # edite ADMIN_EMAIL e ADMIN_PASSWORD
npm start                   # abre em http://localhost:3000
npm test                    # 14 testes automáticos da API
```

## 2. Subir em um servidor com Docker (recomendado)

Precisa de uma VPS (Ubuntu) com Docker e de um domínio apontando para o IP dela.

```bash
git clone <seu-repositorio> agenda-tti && cd agenda-tti     # ou envie esta pasta por scp
cp .env.example .env && nano .env      # preencha ADMIN_*, PUBLIC_URL
docker compose up -d --build
curl http://127.0.0.1:3000/api/health  # deve responder {"ok":true,...}
```

O banco e as fotos ficam no volume `tti-data`. Para o HTTPS, use o Caddy (certificado automático):

```bash
sudo apt install -y caddy
sudo cp Caddyfile.example /etc/caddy/Caddyfile && sudo nano /etc/caddy/Caddyfile   # troque o domínio
sudo systemctl reload caddy
```

Atualizar para uma nova versão: `git pull && docker compose up -d --build` (os dados são mantidos).

## 3. Subir na Hostinger (Node.js + MySQL)

1. No hPanel, crie um **banco MySQL** e anote host, usuário, senha e nome.
2. Em **Sites → Node.js**, crie a aplicação, envie esta pasta (zip ou Git) e use `server.js` como arquivo de entrada.
3. Em variáveis de ambiente, preencha `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
4. Rode `npm install` e inicie. As tabelas são criadas sozinhas na primeira vez.

## 4. Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Acesso ao painel de administração (5 cliques na logo do rodapé). Sem elas, o painel fica desligado. A senha pode ser trocada depois no próprio painel. |
| `PUBLIC_URL` | Endereço do site, usado nos links de convite. |
| `PORT` | Porta (padrão 3000). |
| `DB_NAME` (+ `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`) | Liga o MySQL. Sem `DB_NAME`, usa SQLite. |
| `SQLITE_FILE` | Local do arquivo SQLite (padrão `data/agenda-tti.db`). |
| `SESSION_DAYS` | Duração do login (padrão 30 dias). |

## 5. Cópia de segurança

- **SQLite:** copie o arquivo `data/agenda-tti.db` (com o serviço parado, ou use `sqlite3 agenda-tti.db ".backup copia.db"`). No Docker: `docker run --rm -v agenda-tti_tti-data:/d -v $PWD:/b busybox cp -r /d /b/backup`.
- **MySQL:** `mysqldump` normal.
- **Administração → Ajustes → Cópia de segurança** baixa um JSON com contas, casas, bloqueios, convites e propostas (sem senhas e sem o conteúdo das fotos). Serve como registro, não como restauração completa.

## 6. Como funciona

- O front conversa com a API em `/api/*`. Cada pessoa recebe só o que pode ver: o **corretor nunca vê outro corretor**, apenas datas "livres" ou "seguradas/bloqueadas". O proprietário vê quem fez cada proposta.
- Todas as regras ficam no servidor (`src/policy.js`): aceitar uma proposta bloqueia as datas para toda a rede e encerra as concorrentes; datas ocupadas não aceitam novas propostas; propostas expiram em 48 h; mínimo de noites e lotação são conferidos.
- O front consulta o servidor a cada 5 segundos e se atualiza sozinho quando algo muda.
- Link da casa para o cliente: `/c/<código>?b=<corretor>&lg=pt|en|es`. A página pública não expõe e-mails nem dados privados.
- Convite de corretor: `/?convite=<token>`. O link só funciona com o e-mail convidado.
- `GET /api/health` serve para monitoramento.

## 7. Mapa dos arquivos

```
server.js            ponto de entrada
src/app.js           rotas
src/policy.js        regras de gravação (quem pode o quê)
src/views.js         o que cada perfil enxerga (privacidade)
src/auth.js          cadastro, login, sessões, administrador
src/store.js         casas, fotos, avisos, expiração de propostas
src/migrate.js       criação das tabelas
public/index.html    o site (front)
test/api.test.js     testes da API
scripts/check-db.js  confere a conexão com o banco
```

## 8. Limites conhecidos

- Os avisos aparecem dentro do site; **não há envio de e-mail ou push**. O convite sai como link para copiar/WhatsApp ou pelo e-mail do próprio usuário.
- Sem pagamento entre proprietário e corretor: o adiantamento é só registrado como pago ou não (o acerto é por Pix, fora da plataforma). Pagamento dentro da plataforma só para a assinatura do software.
- O proprietário vê apenas os corretores ligados a ele (convidados, com proposta ou conversa).
- Uma única instância do servidor (as gravações são serializadas). Atende bem centenas de usuários; para mais que isso, use MySQL e avise para ajustarmos.

## 9. Observabilidade

Sem configurar nada, o servidor já escreve **logs JSON** (uma linha por evento, com `reqId`, rota, status e duração; senhas, tokens, e-mails e mensagens são removidos) e devolve `X-Request-Id` em toda resposta. O resto é opcional e se liga por variáveis de ambiente (`.env.example`):

| O que | Como ligar |
|---|---|
| **Métricas Prometheus** | `METRICS_TOKEN=...` e consulte `GET /metrics` com `Authorization: Bearer <token>`. Inclui requisições por rota/status, duração, erros, memória, atraso do event loop e Web Vitals do navegador. |
| **Sentry** (erros) | `npm i @sentry/node` e `SENTRY_DSN=...`. Erros do navegador chegam por `POST /api/telemetry/error` e seguem para o Sentry. |
| **OpenTelemetry** (traces) | `npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node` e `OTEL_EXPORTER_OTLP_ENDPOINT=...`. |
| **Datadog** | Use o OpenTelemetry apontando para o Datadog Agent com OTLP ligado: `OTEL_EXPORTER_OTLP_ENDPOINT=http://<agent>:4318`. |
| **New Relic** | Use o OpenTelemetry: `OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net` e `OTEL_EXPORTER_OTLP_HEADERS=api-key=<chave>`. |

No Docker, construa com `docker compose build --build-arg OBSERVABILITY=1` para incluir os SDKs. Sem os pacotes, o servidor avisa no log e segue funcionando.

## 10. Atualizar o front

`public/index.html` é gerado a partir do front de demonstração (`agenda-tti-proprietario.html`) pelo script `scripts/make-front.py`:
`npm run build:front`
