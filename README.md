# Flor da Mata

App da fazenda Flor da Mata: registro de campo que funciona sem sinal, mapa dos talhões e painel por talhão.
Instala no celular como aplicativo (PWA) e guarda tudo no Supabase.

## O que tem nesta versão (0.1)

- **Registro sem sinal.** Operação, monitoramento (MIP), chuva e estoque ficam guardados no celular e sobem sozinhos quando o sinal volta.
- **GPS escolhe o talhão.** Dentro do contorno desenhado ou perto do centro (até 1,5 km).
- **Pulverização completa.** Produtos da calda com dose por hectare, total calculado e baixa automática no estoque; condição de aplicação (vento, umidade, temperatura) com alerta fora da faixa.
- **MIP.** Nível encontrado × nível de controle; acima do nível vira "Aplicação indicada" e aparece em destaque no painel e no mapa.
- **Mapa.** Satélite com os talhões coloridos pela cultura. Desenho de talhão tocando nos cantos ou andando a divisa com o GPS; área calculada na hora.
- **Painel.** Por talhão: cultura, cultivar, DAP, estádio, andamento do ciclo, colheita prevista, chuva 7/30 dias (pluviômetro do talhão substitui a estimativa), custo de insumos por hectare, produtividade × meta, ocorrências abertas e linha do tempo.
- **Safras, insumos e equipe.** Só dono e encarregado alteram cadastros; operadores registram.

## Para desenvolver

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # cálculos, geometria e fila de envio
npm run e2e        # celular simulado: login, registro sem sinal, reabrir sem sinal, envio ao voltar o sinal
```

O teste `e2e` usa Playwright (`PLAYWRIGHT_MODULE` aponta para o pacote se não estiver no projeto) e simula o Supabase.

## Banco

`supabase/migrations/` tem o esquema completo, com regras de acesso (RLS) por perfil.
`0003_convites.sql` **ainda não foi aplicada**: aguarda a aprovação do Thiago.

Variáveis opcionais em `.env` (veja `.env.example`); sem elas o app usa o projeto Flor da Mata.
