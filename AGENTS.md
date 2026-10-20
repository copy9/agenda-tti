# AGENTS.md — Padrão de trabalho do projeto Agenda TTI

> Leia este arquivo inteiro antes de mexer em qualquer coisa. Vale para **qualquer agente ou modelo** (Claude, GPT, Gemini, Copilot, Cursor etc.) e para pessoas. `CLAUDE.md` e `.github/copilot-instructions.md` apontam para cá. Se algo aqui conflitar com o que o usuário pedir na hora, o usuário vence; avise do conflito.

## 1. O produto (não quebre isto)

Agenda TTI é o meio de comunicação entre **proprietários** e **corretores** de casas e mansões de alto padrão, para acabar com multas por dupla reserva. Não é uma experiência do cliente final: o cliente só vê uma página pública limpa da casa.

- **Um corretor nunca pode saber do outro.** Ele só vê datas *livres*, *bloqueadas/seguradas* ou *negociáveis*, nunca nome, valor, e-mail ou WhatsApp de outro corretor. O proprietário vê quem fez cada proposta. Qualquer mudança em `src/views.js` ou `src/policy.js` precisa manter e testar essa regra.
- **O bloqueio do proprietário tem duas espécies.** *Firme* é o padrão e continua indistinguível de data vendida: barra proposta e interesse, e o corretor não descobre se aquilo é uso do dono ou reserva de um concorrente. *Negociável* é a data que o dono reservou para si mas aceita ouvir oferta: ganha estado próprio no calendário, recebe proposta e interesse, e o aceite libera o bloqueio no mesmo clique. Data vendida nunca pode virar negociável.
- **A fila é invisível, com uma exceção.** O proprietário é avisado quando uma proposta na fila supera o valor em jogo na proposta que está com ele — só o valor, nunca quem ofereceu.
- Aceitar uma proposta bloqueia as datas para toda a rede e encerra as concorrentes. Propostas expiram em 48 h. Mínimo de noites e lotação são conferidos no servidor.
- Idiomas: português, inglês e espanhol em toda a interface. Texto novo entra nos três.
- **A plataforma não processa pagamentos entre proprietário e corretor.** Adiantamento, multas e pendências são acertados por Pix, fora dela; o sistema só registra. Pagamento dentro da plataforma existe apenas para a assinatura do próprio software.
- Hospedagem e domínio ficam por último (issue própria no backlog).

## 2. Fluxo obrigatório: issue → branch → PR → deploy

**Nada vai direto na `main`.** Todo trabalho segue este caminho:

1. **Issue primeiro.** Toda tarefa tem uma issue antes de qualquer código, criada com um dos modelos em `.github/ISSUE_TEMPLATE`:
   | Tipo | Quando | Label |
   |---|---|---|
   | **Correção** | algo que deveria funcionar e não funciona | `tipo: correção` |
   | **Melhoria** | algo que já existe e vai ficar melhor (desempenho, UX, refatoração, qualidade) | `tipo: melhoria` |
   | **Nova função** | algo que ainda não existe | `tipo: nova função` |

   A issue traz contexto, critérios de aceite (checklist) e o que está fora do escopo. Ideia solta vira issue no backlog, não vira código sem pedido.
2. **Uma branch por issue**, saindo da `main` atualizada: `<tipo>/<número>-<slug>`, com tipo em `fix`, `feat`, `chore`, `docs`, `refactor`, `test`, `perf`. Exemplo: `feat/14-skeleton-propostas`.
3. **Commits pequenos** no padrão *Conventional Commits* (validado por commitlint): `tipo(escopo): resumo no imperativo, até 72 caracteres`. Exemplos: `fix(policy): barra proposta em data já aceita`, `feat(ui): skeleton na lista de casas`. Mudança incompatível usa `!` ou `BREAKING CHANGE:` no rodapé.
4. **Pull Request** para a `main` (ou para a branch anterior, se for PR empilhado). A descrição **tem de mencionar a issue** com `Closes #N` (correção/nova função) ou `Refs #N` (trabalho parcial). O workflow `PR policy` reprova PR sem isso. Use o modelo `.github/PULL_REQUEST_TEMPLATE.md` e preencha todas as seções.
5. **CI verde antes de revisar:** lint, arch-contract, knip, testes com cobertura, e2e. Não desligue verificação para passar; corrija a causa.
6. **Merge por *squash*** com o título do PR em Conventional Commits. A issue fecha sozinha. A branch é apagada.
7. **Deploy só a partir da `main`**, por tag `vX.Y.Z` (ver `README.md`). Um PR = um deploy possível; PR que mexe em dados ou variáveis de ambiente descreve a migração e o rollback.

Se não for possível abrir issue/PR (sem acesso ao GitHub, por exemplo), diga isso ao usuário, deixe a branch e os textos prontos em `docs/issues` e `docs/prs` e publique com `npm run publish:github -- dono/repo` assim que houver acesso. Nunca finja que criou.

## 3. Definição de pronto (todo PR)

- [ ] Critérios de aceite da issue cumpridos e marcados.
- [ ] Testes novos ou ajustados (unidade e/ou integração e/ou e2e). Correção de bug começa com um teste que falha.
- [ ] `npm run check` passa (lint, arch-contract, knip, testes).
- [ ] A regra de privacidade entre corretores continua testada.
- [ ] Interface nova segue o padrão de movimento (seção 4) e os três idiomas.
- [ ] Sem segredos, senhas ou dados reais no código, nos logs ou nos testes.
- [ ] Documentação atualizada (`README.md`, `.env.example`, este arquivo) quando algo muda no uso.

## 4. Interface e movimento

Base: skill **Design Motion Principles** (`github.com/kylezantos/design-motion-principles`). A Agenda TTI é uma ferramenta de trabalho de uso diário, então a lente primária é **Emil Kowalski** (restrição e velocidade), a secundária é **Jakub Krehel** (polimento) e **Jhey Tompkins** só no onboarding.

- **Pergunta de entrada:** "isto precisa animar?". Ações frequentes (navegar entre abas, selecionar datas, digitar) são instantâneas ou quase. Nada que o teclado dispara é animado.
- **Tempos:** 120 ms (microinteração), 180 ms (padrão), até 280 ms (painéis). Nunca acima de 300 ms em ferramenta de uso diário. Tokens em `:root`: `--mo-fast`, `--mo-base`, `--mo-slow`.
- **Curvas:** `--ease-out` para entrar, `--ease-in` para sair, `--ease-io` para mudar de estado, `linear` só em shimmer e barras de progresso. Sem `ease` padrão do navegador, sem *bounce* em ação utilitária, sem `scale(0)` (use `scale(.96)` + opacidade).
- **Entrada e saída:** entrar com opacidade + deslocamento de até 8 px; sair mais discreto que entrar. Diálogos, toasts e blocos condicionais **precisam** de saída.
- **Todo carregamento tem estado visível:** *skeleton* com a forma do conteúdo final (lista, cartão, calendário, galeria); barra de progresso global para requisições; botão em `aria-busy` com spinner para ações; progresso por item em envio de fotos. Skeleton é estático sob `prefers-reduced-motion`.
- **Lazy loading:** imagens fora da primeira dobra usam `loading="lazy"` e `decoding="async"` e aparecem com fade; fotos de demonstração ficam em arquivos, não embutidas no HTML.
- **`prefers-reduced-motion: reduce`** é obrigatório em toda animação nova (duração ~0, sem deslocamento).
- **Evite o "motion slop":** pulsos permanentes, blur em tudo, escala no hover de tudo, *stagger* longo (no máximo 8 itens e 240 ms no total), fade uniforme ao montar conteúdo estático.
- Propriedades animadas: `opacity` e `transform`. Evite animar `height`, `width`, `top`, `left`.

## 5. Observabilidade

- Logs estruturados em JSON (um objeto por linha) com `reqId`, rota, status e duração. Nunca registrar senha, token, cookie, e-mail completo ou texto de conversa.
- **Erros:** Sentry (`SENTRY_DSN`) via `src/telemetry.js`; erros do navegador chegam por `POST /api/telemetry/error`.
- **Traces e métricas:** OpenTelemetry por OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`). **Datadog** e **New Relic** são ligados só por variáveis de ambiente, sem mudar código (ver `README.md`).
- Métricas Prometheus em `GET /metrics` (protegido por `METRICS_TOKEN`). Todo código novo de servidor que falha ou demora deve ser observável (log, métrica ou span).
- Os SDKs são **opcionais**: sem as variáveis o servidor roda normalmente e a telemetria vira no-op.

## 6. Qualidade e arquitetura

- **Biome** (lint e formatação), **Commitlint** (mensagens), **Knip** (código e dependências não usados), **Stryker** (mutação, na rotina semanal e sob demanda) e **arch-contract** (`scripts/arch-contract.js`, regras de camadas):
  - `util`, `config` e `http` não importam outras camadas do app;
  - `db` só conhece `config` e `util`; só `db` carrega `mysql2` e `node:sqlite`;
  - `views`, `policy`, `store` e `admin` não importam `app`;
  - o front não usa `eval` nem carrega script de domínio não listado.
- Ganchos locais em `.githooks` (ativados por `npm run prepare`): commit-msg e pre-commit.
- Não desative regra de lint para "passar". Se a regra estiver errada, abra issue de Melhoria.

## 7. Testes

- **Unidade e integração:** `npm test` (`node --test`), com cobertura em `coverage/lcov.info` enviada ao **Codecov** pelo CI.
- **End-to-end:** **Playwright** em `e2e/` (`npm run e2e`) sobre um servidor com banco temporário. Cobre o fluxo completo e a privacidade entre corretores.
- Teste de integração usa SQLite em memória; nunca usa dados reais.
- Meta de cobertura: linhas e funções ≥ 80 % no servidor; `policy.js` e `views.js` com cobertura de ramos alta.

## 8. Comandos

```bash
npm start              # servidor em http://localhost:3000
npm run build:front    # gera public/index.html a partir de front/source.html
npm run check          # lint + arch + knip + testes
npm test               # testes com cobertura
npm run e2e            # Playwright
npm run mutation       # Stryker
npm run publish:github -- dono/repo   # cria issues/PRs a partir de docs/issues e docs/prs
```

## 9. Estrutura

```
src/           servidor (app, policy, views, auth, store, db, telemetry...)
front/source.html   front-fonte (demonstração + modo servidor)
public/        front gerado e arquivos estáticos
test/          unidade e integração
e2e/           Playwright
docs/issues    textos de issues prontos para publicar
docs/prs       textos de PRs prontos para publicar
scripts/       utilitários (arch-contract, make-front, publish-github)
```

## 10. Para agentes: regras de conduta

1. Comece lendo este arquivo e a issue. Sem issue, crie (ou proponha) uma antes de codar.
2. Trabalhe em branch própria; nunca force push na `main`; não reescreva histórico publicado.
3. Não invente resultados: se não rodou o teste, diga que não rodou. Registre o que ficou sem verificar no PR.
4. Mudou comportamento visível? Atualize os três idiomas e verifique em 320 px e em 1280 px, claro e escuro.
5. Termine o PR com a lista do que foi verificado e do que ficou pendente.
