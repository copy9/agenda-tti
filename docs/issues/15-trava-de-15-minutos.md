---
title: "Trava de 15 minutos ao escolher datas"
type: nova função
phase: backlog
---
## Contexto
Hoje o corretor só segura as datas ao enviar a proposta. Entre escolher e enviar, outro corretor pode propor o mesmo período. A trava segura as datas por 15 minutos enquanto o corretor monta a proposta.

## Critérios de aceite
- [ ] Ao selecionar um período livre, o servidor cria uma trava de 15 min para aquele corretor
- [ ] Os outros corretores veem as datas como "seguradas", sem nome, valor ou tempo restante (privacidade)
- [ ] O corretor vê um contador e pode: enviar a proposta (a trava vira proposta pendente), reservar direto, estender uma vez, ou soltar a trava
- [ ] Ao vencer, a trava some sozinha e as datas voltam a ficar livres
- [ ] Uma trava por corretor e por casa ao mesmo tempo; limite diário para evitar abuso
- [ ] Conflito: duas travas na mesma data são impossíveis (decidido no servidor, em transação)
- [ ] Todo evento da trava entra no registro de auditoria (#17)
- [ ] Testes de integração e e2e, incluindo disputa simultânea e privacidade

## Fora do escopo
A cobrança por trava não aproveitada (#16).
