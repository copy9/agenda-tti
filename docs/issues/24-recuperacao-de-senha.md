---
title: "Recuperação de senha"
type: nova função
phase: backlog
---
## Contexto
Quem esquece a senha hoje fica sem acesso. A administração também precisa de um caminho seguro.

## Critérios de aceite
- [ ] "Esqueci a senha" na tela de entrada, nos 3 idiomas
- [ ] Link de redefinição por e-mail (#11), de uso único, que expira em 30 minutos, guardado só como hash no banco
- [ ] A resposta é a mesma exista o e-mail ou não (não revela cadastros)
- [ ] Limite de pedidos por e-mail e por IP
- [ ] Ao redefinir, todas as sessões antigas são encerradas e o usuário é avisado por e-mail
- [ ] Senha nova segue a regra mínima do cadastro
- [ ] Testes: link expirado, reutilizado, e-mail inexistente, limite
- [ ] Redefinição da senha do administrador pela linha de comando do servidor

## Depende de
#11 envio de e-mail.
