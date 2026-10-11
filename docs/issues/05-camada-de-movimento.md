---
title: "Camada de movimento: skeleton, lazy loading, entrada/saída e progresso"
type: nova função
branch: feat/motion-layer
phase: agora
---
## Contexto
A interface muda de tela sem estados de carregamento. Seguir a skill Design Motion Principles (lente primária Emil Kowalski: rápido e contido; Jakub Krehel como apoio).

## Critérios de aceite
- [ ] Tokens de tempo e curva (`--mo-*`, `--ease-*`) e suporte a `prefers-reduced-motion`
- [ ] Skeleton com a forma do conteúdo em: lista de casas, propostas, mensagens, calendário, painel admin e página pública
- [ ] Barra de progresso global para requisições e botões com estado `aria-busy`
- [ ] Imagens com `loading="lazy"`, `decoding="async"` e fade; fotos de demonstração fora do HTML
- [ ] Entrada nas trocas de tela; entrada e saída em diálogos e toasts
- [ ] Progresso por foto no envio
- [ ] Sem animação em ações frequentes (selecionar data, digitar, navegar por teclado)

## Fora do escopo
Biblioteca de animação externa.
