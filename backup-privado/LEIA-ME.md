# backup-privado

Cópia do `.env` (`env.backup`) e do banco SQLite de testes (`banco/agenda-tti.db`, `-shm`, `-wal`, que precisam ficar juntos).

**Esta pasta tem credenciais e dados de contas. O repositório precisa ser privado.** O servidor não lê nada daqui.
Para restaurar: copie `env.backup` para `.env` na raiz e os três arquivos de `banco/` para `data/`.
