# Agenda TTI — Servidor

Servidor completo da Agenda TTI: contas (proprietário, corretor e administrador), casas e fotos, calendário de bloqueios, convites, propostas, conversas, avisos, página pública da casa e painel de administração. O site (front) já vem pronto em `public/index.html` e é entregue pelo próprio servidor. **Não precisa de mais nada além deste projeto.**

- Node 22 ou mais novo, **sem dependências** para rodar com SQLite. `mysql2` só é usado se você configurar MySQL.
- Banco: SQLite (um arquivo, ótimo para começar) ou MySQL/MariaDB (ex.: Hostinger).
- Senhas com scrypt, sessão por cookie `HttpOnly`, limite de tentativas de login, proteção contra CSRF e HTML injetado.

> **Demonstração online:** a página do GitHub Pages abre a versão de demonstração (`index.html`, gerada com `npm run pages`). Ela guarda os dados só no seu navegador, sem contas reais nem comunicação entre pessoas. O app multiusuário de verdade precisa do servidor Node (seções 2 e 3).

## 1. Rodar no seu computador (teste rápido)

```bash
cp .env.example .env        # edite ADMIN_EMAIL e ADMIN_PASSWORD
npm start                   # abre em http://localhost:3000
npm test                    # testes automáticos (API, termos, avisos)
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
| `COMPANY_NAME`, `LEGAL_CONTACT` | Nome da empresa e contato que aparecem nos Termos e na Política de privacidade (`/termos`, `/privacidade`). |
| `LEGAL_VERSION` | Versão dos textos. Ao mudar, todos precisam aceitar de novo. |
| `LEGAL_REVIEWED` | Coloque `1` só depois da revisão de advogado: retira o aviso de minuta das páginas. |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | Mensalidade pelo Mercado Pago (ver abaixo). Sem o token a cobrança fica desligada. |
| `DELETE_GRACE_DAYS` | Carência da exclusão de conta pedida pelo usuário (padrão 7 dias). |

### Avisos por e-mail e push
Convite, proposta, resposta e vencimento viram aviso por e-mail (SMTP próprio, configure `SMTP_*`) e por push no navegador (chaves VAPID geradas e guardadas no banco; service worker em `/sw.js`). Cada pessoa escolhe canal e tipos em Conta, Avisos. Os envios passam por uma fila com tentativas e espera crescente. Avisos a corretores nunca citam outro corretor. Push exige HTTPS em produção.

### Perfil público do corretor
Em Casas para alugar, o corretor abre "Meu perfil público", escolhe o idioma e copia o link com a mensagem pronta. A página `/corretor/<código>` mostra o nome e o WhatsApp dele e só as casas em que ele foi convidado (cada cartão leva à página pública da casa). Não mostra proprietário nem outros corretores. Só existe no modo servidor.

### Mensalidade da plataforma (Mercado Pago)
É o único pagamento dentro do software. Cada conta (proprietário e corretor) tem **7 dias grátis** e depois paga **R$ 10,00 por mês**, por assinatura recorrente do Mercado Pago. Valor, dias grátis, quem paga (todos, só proprietários ou só corretores) e a chave geral "Cobrança ligada" ficam em **Painel de administração > Configurações > Mensalidade**, junto com a lista de contas e a opção de isentar uma conta (cortesia). O novo valor vale para as próximas assinaturas; as já ativas continuam no valor em que foram criadas. Mudar os dias grátis vale para todos na hora.

Para ligar:
1. Em mercadopago.com.br/developers, crie uma aplicação e copie o **Access Token de produção** para `MP_ACCESS_TOKEN`.
2. Em Webhooks da aplicação, cadastre `https://SEU-DOMINIO/api/billing/webhook` com o evento **Assinaturas** (planos e assinaturas, pagamentos recorrentes) e copie a assinatura secreta para `MP_WEBHOOK_SECRET`.
3. `PUBLIC_URL` precisa ser `https://...`: é para onde a pessoa volta depois de pagar.

Sem `MP_ACCESS_TOKEN` a cobrança fica desligada e ninguém é bloqueado. Conta com o teste vencido e sem assinatura fica bloqueada (a API responde 402), mas continuam abertas: assinar, baixar os próprios dados, excluir a conta e todas as páginas públicas (casa, perfil do corretor e página de check-in da família). Cancelar a assinatura mantém o acesso até o fim do período pago, e excluir a conta cancela a assinatura. O e-mail da pessoa não vai para o Mercado Pago: o vínculo é um código interno.

### Recuperação de senha
Em Entrar, "Esqueci a senha" envia por e-mail um link que vale 30 minutos e uma única vez (no banco fica só o hash). A resposta é a mesma exista o e-mail ou não, há limite por e-mail e por IP, e ao redefinir todas as sessões são encerradas e a pessoa recebe um aviso. Exige `SMTP_*` configurado. A senha do administrador continua vindo de `ADMIN_PASSWORD`.

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
src/billing.js       mensalidade (período grátis, assinatura no Mercado Pago, painel)
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
