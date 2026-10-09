# Segurança do app Flor da Mata

## O que protege o app hoje

| Camada | Como | Onde |
|---|---|---|
| HTTPS | GitHub Pages serve `github.io` só por HTTPS; a CSP força `upgrade-insecure-requests` e a revisão recusa endereço `http://` no código publicado | `index.html`, `scripts/revisao-seguranca.mjs` |
| Chaves | No app só vai a chave **publicável** do Supabase (feita para ser pública). A chave `service_role` vive só no servidor (função `clima`). O código do agendador do clima fica no cofre (Vault) do banco | `src/lib/supabase.ts`, `supabase/functions/clima` |
| Quem entra | Cadastro **só por convite**: e-mail sem convite nem cria conta (nenhum e-mail de confirmação sai) | migração 0009 |
| Quem vê/altera | RLS em todas as tabelas: equipe lê; operador grava como ele mesmo; dono/encarregado mexem nos cadastros; autor de um registro não pode ser trocado | migrações 0001, 0009 |
| Formulários | Faixas de valor, tamanho de texto e data plausível conferidos no celular (aviso na hora, mesmo sem sinal) **e** no banco | `src/lib/validar.ts`, migração 0009 |
| Spam e abuso | Convite obrigatório; limite de 600 registros por pessoa/tabela/hora; limites de tentativa do Supabase Auth; fotos só imagem até 5 MB; função do clima só aceita o agendador | migrações 0008, 0009 |
| Headers | CSP, referrer e bloqueio de abrir dentro de outro site (via código, porque o Pages não aceita cabeçalhos) | `index.html`, `src/main.tsx` |
| Dependências | `npm audit` a cada publicação; Dependabot mensal em um pedido só, e imediato em falha de segurança | `.github/dependabot.yml` |
| Revisão antes de publicar | `npm run revisao` + gitleaks no histórico inteiro. Se reprovar, nada vai para o ar | `.github/workflows/publicar.yml` |

## Limites conhecidos (GitHub Pages)

O Pages não permite cabeçalhos HTTP próprios. Ficam de fora: `Strict-Transport-Security` (o próprio
`github.io` já está na lista HSTS dos navegadores), `frame-ancestors`/`X-Frame-Options` (coberto pelo
bloqueio em `main.tsx`), `X-Content-Type-Options` e `Permissions-Policy`. Para ter todos, basta mover
a hospedagem para Cloudflare Pages ou Netlify (gratuitos) com um arquivo `_headers`.

## Antes de cada publicação

1. `npm test` e `npm run build`
2. `npm run revisao` (segredos, CSP, HTTPS, RLS, dependências)
3. gitleaks no histórico (só no CI)
4. Mudou o banco? Conferir os avisos de segurança do Supabase (Advisors) depois da migração.
