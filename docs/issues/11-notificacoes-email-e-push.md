---
title: "Notificações por e-mail e push"
type: nova função
phase: backlog
---
## Contexto
Hoje os avisos só aparecem dentro do site e o convite sai como link. Proprietário e corretor precisam ser avisados fora do site, principalmente de proposta recebida, resposta, contraproposta, proposta perto de expirar e trava de data.

## Critérios de aceite
- [ ] E-mail por SMTP configurável (`SMTP_*`), com modelo em português, inglês e espanhol, no idioma do destinatário
- [ ] Push web (PWA instalado ou navegador) com permissão pedida no momento certo, nunca no primeiro acesso
- [ ] Eventos: convite, proposta recebida, aceite/recusa/contraproposta, lembrete 6 h antes de expirar, trava prestes a vencer, trava vencida
- [ ] Preferências por usuário: canal (e-mail, push, ambos, nenhum) e por tipo de evento
- [ ] Nenhuma notificação revela a identidade de outro corretor
- [ ] Fila com tentativas e registro de falha (observabilidade)

## Depende de
PWA (#10) para push no celular.
