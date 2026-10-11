---
title: "Registro de pendência quando o corretor trava a data e não aproveita"
type: nova função
phase: backlog
---
## Contexto
Travar datas (#15) e não dar proposta, não reservar ou soltar a trava tira a data do mercado sem resultado. A plataforma **não cobra e não processa pagamento**: ela só registra a pendência, e proprietário e corretor se acertam por fora (Pix). Pagamento dentro da plataforma existe apenas para a assinatura do próprio software (#13).

## Regra proposta (a confirmar)
Gera pendência quando a trava termina em: vencimento sem proposta, soltura, ou proposta retirada sem justificativa. Não gera quando vira proposta aceita, ou quando o proprietário recusa ou cancela.

## Critérios de aceite
- [ ] O proprietário define, por casa, se usa pendência por trava e o valor combinado (texto ou número, só informativo)
- [ ] O corretor aceita o termo antes da primeira trava e vê o valor combinado antes de travar
- [ ] Extrato de pendências por corretor e por proprietário, com a linha do tempo da trava (do registro de auditoria #17)
- [ ] O proprietário marca a pendência como "acertada" ou "perdoada"; sem integração de pagamento
- [ ] Contestação pelo corretor, analisada pela administração
- [ ] Aviso ao corretor antes de a trava vencer (#11)
- [ ] Privacidade: o proprietário vê quem travou; outros corretores nunca veem
- [ ] Testes para cada desfecho (gera / não gera)

## Depende de
#15 trava de 15 minutos e #17 registro de auditoria.
