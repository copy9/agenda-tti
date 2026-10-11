---
title: "Cobrança quando o corretor trava a data e não aproveita"
type: nova função
phase: backlog
---
## Contexto
Travar datas e não dar proposta, não reservar ou soltar a trava tira a data do mercado sem resultado. O proprietário perde oportunidades. Queremos desencorajar travas sem intenção.

## Regra proposta (a confirmar)
Há cobrança quando uma trava (#15) termina em: vencimento sem proposta, desistência/soltura, ou proposta retirada sem justificativa. Não há cobrança quando a trava vira proposta aceita, ou o próprio proprietário recusa ou cancela.

## Decisões em aberto
- [ ] Valor: fixo por trava, percentual da diária, ou definido por casa pelo proprietário?
- [ ] Prazo de graça (ex.: soltar em até 2 minutos sem cobrança)?
- [ ] Quem recebe: o proprietário, a plataforma, ou divisão?
- [ ] Como cobrar sem pagamento online: lançar a pendência no extrato do corretor e acertar por fora até existir o pagamento (#13)?
- [ ] Forma de contestar uma cobrança e quem decide (administração)

## Critérios de aceite
- [ ] Corretor aceita o termo da cobrança antes da primeira trava e vê o valor antes de travar
- [ ] Extrato de pendências por corretor e por proprietário, com a linha do tempo da trava (do registro de auditoria)
- [ ] Contestação com análise da administração
- [ ] Notificação ao corretor antes de a trava vencer (#11)
- [ ] Privacidade: o proprietário vê quem travou (como já vê nas propostas); outros corretores nunca veem
- [ ] Testes cobrindo cada desfecho (cobra / não cobra)

## Depende de
#15 trava de 15 minutos e #17 registro de auditoria. Cobrança automática depende de #13.
