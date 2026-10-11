# Textos de issues

Cada arquivo `NN-slug.md` vira uma issue no GitHub. Formato:

```
---
title: "..."
type: nova função | melhoria | correção
branch: feat/slug        # opcional: branch de código desta issue
phase: backlog | agora   # opcional
---
corpo em Markdown
```

Publique com `npm run publish:github -- dono/repo` (use `--dry-run` para só conferir).
