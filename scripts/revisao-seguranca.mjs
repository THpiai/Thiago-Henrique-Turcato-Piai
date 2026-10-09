// Revisão de segurança que roda antes de cada publicação (workflow "Publicar app") e com
// `npm run revisao`. Se algo falhar, o app NÃO é publicado e o motivo aparece no log.
// Confere: chave secreta no código, regras de segurança no index.html publicado,
// endereço sem HTTPS, tabela nova sem RLS e dependências com falha conhecida.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const falhas = []
const ok = (m) => console.log(`  ✔ ${m}`)
const falha = (m) => { falhas.push(m); console.log(`  ✘ ${m}`) }

// 1. Segredos nos arquivos do repositório (o repo é público).
console.log('1. Chaves e senhas no código')
const arquivos = execSync('git ls-files', { encoding: 'utf8' }).split('\n')
  .filter((f) => f && !/package-lock\.json$|\.(png|jpe?g|webp|woff2?|ico)$/.test(f))
const PADROES = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'chave secreta do Supabase (sb_secret_)'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chave privada'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'token do GitHub'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'chave da AWS'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{30,}/, 'chave de API (sk-)'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'chave do Google'],
  [/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/, 'senha do banco em URL'],
]
let achou = false
for (const f of arquivos) {
  if (f === 'scripts/revisao-seguranca.mjs' || !existsSync(f)) continue
  const txt = readFileSync(f, 'utf8')
  for (const [re, nome] of PADROES) if (re.test(txt)) { falha(`${nome} em ${f}`); achou = true }
  // JWT do Supabase: só o de papel "anon" pode aparecer.
  for (const jwt of txt.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    try {
      const corpo = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
      if (corpo.role !== 'anon') { falha(`token com papel "${corpo.role}" em ${f}`); achou = true }
    } catch { /* não é JWT de verdade */ }
  }
}
if (!achou) ok(`nenhum segredo em ${arquivos.length} arquivos`)

// 2. Regras de segurança no app gerado.
console.log('2. Regras de segurança no app publicado (dist/index.html)')
if (!existsSync('dist/index.html')) falha('dist/index.html não existe: rode o build antes')
else {
  const html = readFileSync('dist/index.html', 'utf8')
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ''
  if (!csp) falha('sem Content-Security-Policy')
  else {
    for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", 'upgrade-insecure-requests'])
      if (!csp.includes(d)) falha(`CSP sem "${d}"`)
    if (/script-src[^;]*'unsafe-(inline|eval)'/.test(csp)) falha('CSP libera script inline/eval')
    if (!falhas.some((x) => x.startsWith('CSP'))) ok('CSP completa')
  }
  if (!/name="referrer"/.test(html)) falha('sem política de referrer'); else ok('referrer restrito')
  // Endereços sem HTTPS dentro do código publicado (fora namespaces de SVG/XML).
  const http = []
  for (const f of readdirSync('dist/assets').filter((x) => /\.(js|css|html)$/.test(x))) {
    const t = readFileSync(join('dist/assets', f), 'utf8')
    for (const m of t.match(/["'`(]http:\/\/[^"'`)\s]+/g) ?? [])
      if (!/w3\.org|localhost|127\.0\.0\.1|xmlns|purl\.org|ns\.adobe\.com|openstreetmap\.org\/copyright|reactjs\.org|react\.dev/.test(m)) http.push(`${f}: ${m.slice(1, 80)}`)
  }
  if (http.length) http.forEach((h) => falha(`endereço sem HTTPS: ${h}`)); else ok('tudo em HTTPS')
}

// 3. Toda tabela criada nas migrações tem RLS ligado.
console.log('3. Proteção por linha (RLS) nas tabelas do banco')
const sql = readdirSync('supabase/migrations').sort().map((f) => readFileSync(join('supabase/migrations', f), 'utf8')).join('\n')
const tabelas = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1])
const comRls = new Set([...sql.matchAll(/alter table public\.(\w+) enable row level security/gi)].map((m) => m[1]))
// 0001 liga o RLS num laço: conta as tabelas listadas nele.
for (const m of sql.matchAll(/foreach t in array array\[([^\]]+)\]\s*loop\s*execute format\('alter table public\.%I enable row level security'/gi))
  for (const t of m[1].match(/'(\w+)'/g) ?? []) comRls.add(t.replace(/'/g, ''))
const sem = tabelas.filter((t) => !comRls.has(t))
if (sem.length) sem.forEach((t) => falha(`tabela ${t} sem RLS`)); else ok(`${tabelas.length} tabelas, todas com RLS`)

// 4. Dependências com falha de segurança conhecida (alta ou crítica).
console.log('4. Dependências')
try {
  execSync('npm audit --omit=dev --audit-level=high', { stdio: 'pipe' })
  ok('nenhuma falha alta ou crítica nas dependências do app')
} catch (e) {
  const saida = String(e.stdout ?? '')
  // Sem acesso ao registro do npm não dá para concluir; o CI sempre tem.
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|audit endpoint returned an error/.test(saida + String(e.stderr ?? ''))) console.log('  ! sem acesso ao npm para auditar agora')
  else falha('npm audit encontrou falha alta ou crítica:\n' + saida.split('\n').slice(-15).join('\n'))
}

console.log(falhas.length ? `\nRevisão REPROVADA (${falhas.length}). Nada foi publicado.` : '\nRevisão aprovada.')
process.exit(falhas.length ? 1 : 0)
