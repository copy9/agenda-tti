---
title: "feat(ui): camada de movimento com skeleton, lazy loading, entrada/saída e progresso"
---
## Issue

Closes {{ISSUE}}

## O que mudou

Segue a skill *Design Motion Principles* (lente primária Emil Kowalski, apoio Jakub Krehel; ferramenta de uso diário, então rápido e contido).

- **Tokens**: `--mo-fast/base/slow` (120/180/280 ms) e curvas `--ease-out/in/io` customizadas; sem `ease` padrão, sem bounce, sem `scale(0)`. `prefers-reduced-motion` zera durações, entradas e saídas.
- **Skeleton** com a forma do conteúdo final: lista de casas (ao entrar e ao abrir com sessão), painel admin, página pública e convite. Brilho linear, estático em reduced-motion.
- **Progresso**: barra global fina no topo para requisições (consultas em segundo plano ficam de fora), botões em `aria-busy` com spinner (entrar, convidar, admin) e um esqueleto por foto no envio.
- **Entrada** só quando a tela muda (aba, casa, proposta), nunca a cada atualização de dados; *stagger* de no máximo 8 cartões e 210 ms.
- **Saída** em diálogos (inclui Esc), toasts e troca de tela inteira (entrar, sair, admin) por View Transitions, com queda para instantâneo sem suporte.
- **Lazy loading**: imagens novas ganham `loading="lazy"`, `decoding="async"` e fade; a primeira foto da página pública e o lightbox ficam imediatos.
- Sem animação em ações frequentes (selecionar data, digitar, navegar).
- Testes e2e de movimento em `e2e/motion.spec.js`.

## Como verificar

```bash
npm run build:front && npm start
```
Entrar com uma conta e recarregar com a aba de rede lenta: skeleton e barra aparecem e somem quando os dados chegam. Ativar "reduzir movimento" no sistema: entradas e saídas desaparecem.
Verificado com Playwright (Python) em 1280 px e 375 px: skeleton visível, barra de progresso, entrada `mo-in`, diálogo com saída, `loading=lazy`, página pública com skeleton, reduced-motion e sem rolagem horizontal. Fluxo e2e completo (14 etapas) sem regressão e sem erros de console.

## Checklist (AGENTS.md §3)

- [x] Critérios de aceite da issue cumpridos (exceto o item abaixo)
- [x] Testes novos
- [x] `npm test` (48) e `npm run arch` passam
- [x] Privacidade entre corretores: sem mudança de dados
- [x] Interface segue o padrão de movimento; 320–1280 px
- [x] Sem segredos
- [x] Docs: AGENTS.md §4 já descreve o padrão

## Deploy

Regenerar `public/index.html` (`npm run build:front`, já incluso neste PR). Nada de variáveis novas.

## Não verificado

- "Fotos de demonstração fora do HTML": **não feito** neste PR. As 14 fotos da home continuam embutidas (HTML de ~1,8 MB). Fica para uma issue de Melhoria (extrair para `/assets`).
- Verificado só no Chromium, sem Safari/Firefox. A saída por View Transitions depende de suporte do navegador.
- `e2e/motion.spec.js` (Playwright Test) não foi executado aqui; a mesma verificação foi feita com Playwright para Python.
- O float infinito decorativo dos cartões da home foi mantido (já existia e respeita reduced-motion).
