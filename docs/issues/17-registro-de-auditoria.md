---
title: "Registro de auditoria de datas e propostas"
type: nova função
phase: backlog
---
## Contexto
Se houver disputa ou multa por dupla reserva, o proprietário precisa de prova do que aconteceu com cada data.

## Critérios de aceite
- [ ] Tabela de eventos somente de inclusão (sem editar ou apagar): bloqueio/desbloqueio, trava, soltura, vencimento, proposta enviada, contraproposta, aceite, recusa, cancelamento, expiração, pagamento marcado
- [ ] Cada evento guarda quem (papel e id), o quê, quando (servidor), casa, datas e valores
- [ ] Linha do tempo por casa e por data para o proprietário (com nomes); para o corretor, só os eventos dele
- [ ] Corretor nunca vê eventos de outro corretor
- [ ] Exportação em CSV e PDF pelo proprietário e pela administração
- [ ] Integridade: encadeamento por hash entre eventos para detectar adulteração
- [ ] Retenção definida (LGPD) e testes de que nada é editável
