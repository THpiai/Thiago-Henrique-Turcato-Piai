# Contexto do projeto para o Claude

## Mapa do código (graphify)

`graphify-out/` tem um grafo do código (telas, lib, migrações do Supabase, testes) com os módulos agrupados e as peças mais conectadas.

- **Antes de explorar o código**, leia `graphify-out/GRAPH_REPORT.md`: arquitetura, peças centrais ("God Nodes") e ligações entre módulos. Depois abra só os arquivos que o relatório apontou.
- Para perguntas específicas, se o comando estiver disponível (`pip install "graphifyy[sql]"`), use `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"` ou `graphify explain "<peça>"`.
- **Não precisa atualizar o grafo à mão.** O workflow `.github/workflows/grafo.yml` roda `graphify update .` a cada push na `main` que mexe em código e faz o commit do resultado.
- `graphify-out/graph.json` é reescrito inteiro a cada atualização; diferença grande nele num PR é esperada.
