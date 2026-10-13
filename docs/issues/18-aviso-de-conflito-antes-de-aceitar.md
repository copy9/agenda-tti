---
title: "Aviso de conflito antes de aceitar a proposta"
type: melhoria
phase: backlog
---
## Contexto
Aceitar bloqueia as datas e encerra propostas concorrentes. O proprietário deve saber disso antes de confirmar.

## Critérios de aceite
- [ ] Ao tocar em aceitar, mostrar confirmação: "isto encerra N propostas concorrentes e bloqueia X noites" com a lista das propostas afetadas (o proprietário vê quem são)
- [ ] Mostrar também travas ativas nas mesmas datas (#15)
- [ ] Se algo mudou desde que a tela abriu, atualizar e avisar em vez de aceitar às cegas
- [ ] Texto nos 3 idiomas, saída do diálogo animada, foco no botão seguro
- [ ] Teste e2e do fluxo com concorrência
