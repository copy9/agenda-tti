---
title: "Aviso e anotação no perfil quando o corretor trava a data e não aproveita"
type: nova função
phase: backlog
---
## Contexto
Travar datas (#15) e não dar proposta, não reservar ou não soltar a trava tira a data do mercado sem resultado. A plataforma **não cobra e não processa pagamento**. O fluxo é:

1. O corretor trava a data.
2. Perto do fim do prazo, ele recebe uma **notificação para decidir**: enviar proposta, reservar ou soltar a trava. Decidindo dentro do prazo, não há problema na conta.
3. Se o prazo acabar sem decisão, a trava expira e fica uma **anotação no perfil do corretor**.
4. As anotações servem de registro para uma **cobrança futura**, combinada entre proprietário e corretor por fora (Pix), e também para **coibir o acúmulo**: travar as datas importantes sem intenção real para vendê-las depois, prejudicando a concorrência.
5. Sem resposta a tempo, a data é **liberada automaticamente** (#15); a anotação não depende de o corretor responder.

## Critérios de aceite
- [ ] Notificação ao corretor antes de a trava vencer (ex.: 5 min antes; e-mail/push via #11, aviso no site sempre), com os botões: enviar proposta, reservar, soltar, estender uma vez
- [ ] Soltar ou converter dentro do prazo não gera anotação
- [ ] Trava vencida sem decisão gera anotação no perfil: casa, datas, horário da trava e do vencimento (vindos do registro de auditoria #17)
- [ ] O corretor vê as próprias anotações e o total acumulado; o proprietário vê as anotações das casas dele; a administração vê todas
- [ ] Corretor nunca vê anotações de outro corretor
- [ ] O proprietário pode marcar a anotação como "acertada" ou "perdoada" (sem integração de pagamento)
- [ ] Escalonamento por reincidência (valores a confirmar): 1ª e 2ª anotação só registram; a partir da 3ª o limite de travas simultâneas do corretor cai; com reincidência alta a função de trava é suspensa e a administração é avisada
- [ ] Anotações têm validade (ex.: 90 dias sem novas) para o corretor recuperar o limite
- [ ] Relatório para o proprietário: datas nobres travadas e vencidas, por corretor, para ele enxergar o padrão
- [ ] Contestação pelo corretor, analisada pela administração
- [ ] O corretor aceita um termo (#23) explicando as anotações antes da primeira trava
- [ ] Testes para cada desfecho (decidiu a tempo / venceu / contestou)

## Decisões em aberto
- [ ] As anotações de um corretor aparecem para todos os proprietários que o convidaram, ou só para o dono da casa?
- [ ] Prazo de graça (ex.: soltar em até 2 minutos nunca anota)?
- [ ] Valor combinado por casa (texto informativo) ou só o registro?

## Depende de
#15 trava de 15 minutos, #17 registro de auditoria, #11 notificações e #23 termos.
