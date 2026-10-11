---
title: "Data de pagamento do adiantamento na proposta e botão de confirmar pagamento"
type: melhoria
phase: backlog
---
## Contexto
Hoje o adiantamento (%) aparece na proposta e o proprietário marca "pago" à mão, sem prazo. A plataforma **não processa o pagamento** (o acerto é por Pix, fora dela); ela só registra prazo e confirmação.

## Critérios de aceite
- [ ] A proposta ganha a **data de pagamento do adiantamento** (campo obrigatório quando a casa exige adiantamento), com sugestão padrão (ex.: 48 h após o aceite) e limite máximo definido pelo proprietário na casa
- [ ] O proprietário pode ajustar a data na contraproposta; o aceite fecha a data combinada
- [ ] Depois do aceite, o proprietário vê o botão **Confirmar pagamento do adiantamento**, com valor e data combinados; ao confirmar, ficam registrados quando e por quem (auditoria #17)
- [ ] O corretor vê o status do adiantamento (aguardando, confirmado, atrasado), nunca o de outros corretores
- [ ] Lembretes (#11): ao corretor perto da data; ao proprietário no dia combinado ("o adiantamento foi pago?")
- [ ] Passada a data sem confirmação, o proprietário decide: dar mais prazo, ou cancelar e liberar as datas para a rede; o cancelamento gera anotação no perfil do corretor (#16)
- [ ] Datas e textos nos 3 idiomas; cotação em PDF (#20) mostra a data do adiantamento
- [ ] Testes: data inválida (antes do aceite, acima do máximo), confirmação só pelo proprietário da casa, atraso, cancelamento que libera as datas
