---
title: "Tirar as fotos de demonstração de dentro do HTML"
type: melhoria
phase: backlog
---
## Contexto
As 14 fotos da home estão embutidas em base64 e deixam o HTML com ~1,8 MB, o que pesa no primeiro carregamento (principalmente no celular).

## Critérios de aceite
- [ ] Fotos extraídas para `public/assets/` e servidas com cache longo
- [ ] `make-front.py` troca os data URIs por caminhos no modo servidor
- [ ] HTML abaixo de 400 KB e fotos com `loading="lazy"`
- [ ] Rota estática segura (sem `..`) coberta por teste
