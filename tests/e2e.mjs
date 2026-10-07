// Teste de ponta a ponta: login, registro SEM SINAL, recarregar sem sinal, e envio quando o sinal volta.
// O Supabase é simulado; roda contra o build (npm run build) servido pelo vite preview.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')

const PORTA = 4173, BASE = `http://localhost:${PORTA}/`
const SAIDA = process.env.E2E_SAIDA ?? 'tests/telas'
mkdirSync(SAIDA, { recursive: true })

const eu = { id: '11111111-1111-4111-8111-111111111111', nome: 'Thiago', email: 'thiago@exemplo.com', perfil: 'dono', ativo: true }
const sq = (lat, lng, d) => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] })
const hoje = new Date(), iso = (n) => new Date(hoje - n * 864e5).toISOString().slice(0, 10)
const banco = {
  pessoas: [eu],
  talhoes: [
    { id: 't1', nome: 'T01 Sede', area_ha: 82.5, contorno: sq(-17.8, -50.9, 0.008), latitude: -17.796, longitude: -50.896, pluviometro: true, ativo: true },
    { id: 't2', nome: 'T02 Baixada', area_ha: 64, contorno: sq(-17.8, -50.89, 0.007), latitude: -17.7965, longitude: -50.8865, pluviometro: true, ativo: true },
    { id: 't3', nome: 'T03 Cana', area_ha: 120, contorno: sq(-17.81, -50.9, 0.01), latitude: -17.805, longitude: -50.895, pluviometro: false, ativo: true },
  ],
  insumos: [
    { id: 'i1', nome: 'Fungicida X', tipo: 'Defensivo', unidade: 'L', estoque_minimo: 50, ativo: true },
    { id: 'i2', nome: 'Inseticida Y', tipo: 'Defensivo', unidade: 'L', estoque_minimo: 20, ativo: true },
  ],
  ciclos: [
    { id: 'c1', talhao_id: 't1', safra: 'Safra 2026/27', cultura: 'Soja', cultivar: 'BRS 1003', ciclo_cultivar_dias: 115, data_plantio: iso(38), estadio_atual: 'Vegetativo (V)', status: 'Em andamento', meta_por_ha: 68 },
    { id: 'c2', talhao_id: 't2', safra: 'Safra 2026/27', cultura: 'Soja', cultivar: 'TMG 2383', ciclo_cultivar_dias: 120, data_plantio: iso(25), status: 'Em andamento', meta_por_ha: 65 },
    { id: 'c3', talhao_id: 't3', safra: 'Cana 2026/27', cultura: 'Cana-de-açúcar', data_plantio: iso(160), estadio_atual: 'Cana: Crescimento', corte_cana: 3, status: 'Em andamento' },
  ],
  operacoes: [], operacao_produtos: [],
  campo: [{ id: 'm1', data_hora: hoje.toISOString(), autor_id: eu.id, talhao_id: 't2', tipo: 'Praga', alvo: 'Percevejo-marrom', nivel_encontrado: 2.5, unidade_nivel: 'insetos/pano', nivel_de_controle: 2, urgencia: 'Alta', status: 'Aplicação indicada' }],
  estoque_mov: [],
  chuva: [{ id: 'r1', data: iso(2), talhao_id: 't1', milimetros: 18, fonte: 'Pluviômetro' }, { id: 'r2', data: iso(2), talhao_id: null, sede_id: 's1', milimetros: 14, fonte: 'Estimativa automática' }, { id: 'r3', data: iso(3), talhao_id: null, sede_id: 's2', milimetros: 22, fonte: 'Estimativa automática' }],
  sedes: [{ id: 's1', nome: 'Flor da Mata', latitude: -17.797, longitude: -50.895 }, { id: 's2', nome: 'Carlim', latitude: -17.95, longitude: -50.85 }],
  clima_horario: Array.from({ length: 48 }, (_, i) => {
    const h = new Date(Math.floor(Date.now() / 3600e3) * 3600e3 + (i - 6) * 3600e3)
    const hl = (h.getUTCHours() + 21) % 24 // hora de Brasília
    return { sede_id: i % 2 ? 's1' : 's1', hora: h.toISOString(), temperatura_c: 18 + 10 * Math.sin(((hl - 9) / 24) * 2 * Math.PI), umidade_pct: 85 - 35 * Math.sin(((hl - 9) / 24) * 2 * Math.PI), vento_kmh: 4 + (hl % 7), chuva_mm: 0 }
  }),
  v_estoque: [
    { insumo_id: 'i1', nome: 'Fungicida X', unidade: 'L', estoque_minimo: 50, saldo: 120, custo_medio: 95 },
    { insumo_id: 'i2', nome: 'Inseticida Y', unidade: 'L', estoque_minimo: 20, saldo: 12, custo_medio: 140 },
  ],
}
const recebidos = []
let semSinal = false

const servidor = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORTA), '--strictPort'], { stdio: 'ignore' })
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break } catch { /* ainda subindo */ }
  if (i > 100) throw new Error('vite preview não subiu')
  await new Promise((ok) => setTimeout(ok, 200))
}

console.log('servidor ok')
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' })
const ctx = await nav.newContext({
  viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  geolocation: { latitude: -17.796, longitude: -50.896, accuracy: 8 }, permissions: ['geolocation'],
})
await ctx.route(/arcgisonline|openstreetmap/, (r) => r.abort())
await ctx.route(/supabase\.co/, async (r) => {
  if (semSinal) return r.abort('internetdisconnected')
  const req = r.request(), url = new URL(req.url())
  const json = (corpo, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) })
  if (url.pathname.startsWith('/auth/v1/token')) {
    const agora = Math.floor(Date.now() / 1000)
    return json({ access_token: 'tok', token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: 'ref', user: { id: eu.id, email: eu.email, aud: 'authenticated', role: 'authenticated' } })
  }
  if (url.pathname.startsWith('/auth/v1/')) return json({})
  const tabela = url.pathname.split('/').pop()
  if (req.method() === 'POST') {
    const linhas = JSON.parse(req.postData())
    recebidos.push({ tabela, linhas })
    const lista = banco[tabela] ?? (banco[tabela] = [])
    for (const l of linhas) { const i = lista.findIndex((x) => x.id === l.id); i >= 0 ? (lista[i] = { ...lista[i], ...l }) : lista.push(l) }
    return r.fulfill({ status: 201, body: '' })
  }
  const linhas = banco[tabela] ?? []
  if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return json(linhas[0] ?? null)
  return json(linhas)
})

console.log('navegador ok')
const pagina = await ctx.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e)))
const foto = (n) => pagina.screenshot({ path: `${SAIDA}/${n}.png` })
const espera = (t, ms = 10000) => pagina.getByText(t).first().waitFor({ timeout: ms })
const ok = (cond, msg) => { if (!cond) throw new Error('FALHOU: ' + msg); console.log('✔', msg) }

try {
  await pagina.goto(BASE)
  await pagina.getByLabel('E-mail').fill(eu.email)
  await pagina.getByLabel('Senha').fill('senha-de-teste')
  await pagina.getByRole('button', { name: 'Entrar' }).click()
  await espera('Olá, Thiago')
  await espera('T01 Sede')
  await espera('Tudo enviado')
  await espera('Clima nas sedes')
  await espera('Janela para pulverizar')
  ok(true, 'login e painel carregados, com clima das sedes')
  await foto('1-inicio')

  // Service worker pronto para abrir sem sinal.
  await pagina.evaluate(() => navigator.serviceWorker.ready)
  await pagina.reload(); await espera('T01 Sede')

  // Sem sinal.
  semSinal = true
  await ctx.setOffline(true)
  await espera('Sem sinal')
  ok(true, 'app percebe que ficou sem sinal')

  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Operação/ }).click()
  await espera('Você está no T01 Sede')
  ok(await pagina.locator('form select').first().inputValue() === 't1', 'GPS escolheu o talhão sozinho')
  await pagina.getByRole('radio', { name: 'Pulverização' }).click()
  await pagina.getByRole('button', { name: '+ Produto' }).click()
  await pagina.getByLabel('Insumo').selectOption('i1')
  await pagina.getByLabel('Dose por hectare').fill('0,6')
  await espera('Total: 49,5 L')
  await pagina.getByLabel('Alvo', { exact: true }).fill('Ferrugem-asiática')
  await pagina.getByRole('button', { name: /Usar clima estimado da sede Flor da Mata/ }).click()
  ok((await pagina.getByLabel('Umidade %').inputValue()) !== '', 'condição da aplicação preenchida pelo clima da sede')
  await pagina.getByLabel('Vento km/h').fill('14')
  await espera('fora da faixa recomendada')
  await foto('2-operacao-sem-sinal')
  await pagina.getByRole('button', { name: 'Salvar operação' }).click()
  await espera('1 guardado(s) no celular')
  ok(recebidos.length === 0, 'nada foi enviado sem sinal')

  // Monitoramento acima do nível de controle, ainda sem sinal.
  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Monitoramento/ }).click()
  await pagina.getByRole('radio', { name: 'Praga' }).click()
  await pagina.getByLabel(/^Alvo/).fill('Lagarta-falsa-medideira')
  await pagina.getByLabel('Encontrado').fill('4')
  await pagina.getByLabel('Nível de controle').fill('2')
  await espera('aplicação indicada')
  await pagina.getByRole('button', { name: 'Salvar', exact: true }).click()
  await espera('2 guardado(s) no celular')
  await espera('Olá, Thiago')

  // Fecha e reabre o app sem sinal: tudo continua lá.
  await pagina.reload()
  await espera('2 guardado(s) no celular')
  ok(true, 'reabriu sem sinal com os registros guardados')
  await pagina.getByRole('button', { name: /T01 Sede/ }).click()
  await espera('Pulverização · Ferrugem-asiática')
  await espera('Fungicida X 0,6 L/ha')
  await foto('3-talhao-sem-sinal')

  // Sinal volta.
  semSinal = false
  await ctx.setOffline(false)
  await espera('Tudo enviado', 15000)
  const ordem = recebidos.map((r) => r.tabela)
  ok(ordem.indexOf('operacoes') < ordem.indexOf('operacao_produtos'), `subiu em ordem: ${ordem.join(' → ')}`)
  const p = recebidos.find((r) => r.tabela === 'operacao_produtos').linhas[0]
  ok(Math.abs(p.quantidade_total - 49.5) < 1e-9 && p.insumo_id === 'i1', 'produto chegou com a quantidade certa')
  ok(!JSON.stringify(recebidos).includes('_pendente'), 'nenhum campo interno vazou para o servidor')
  ok(recebidos.find((r) => r.tabela === 'campo').linhas[0].status === 'Aplicação indicada', 'MIP chegou como aplicação indicada')

  await pagina.getByRole('button', { name: /Início/ }).click()
  await espera('aplicações indicadas')
  await foto('4-inicio-depois')
  await pagina.getByRole('button', { name: /Mapa/ }).click()
  await pagina.locator('.leaflet-interactive').first().waitFor()
  ok(await pagina.locator('path.leaflet-interactive').count() >= 3, 'mapa desenha os talhões')
  await foto('5-mapa')
  await pagina.getByRole('button', { name: /Estoque/ }).click()
  await espera('Inseticida Y')
  await foto('6-estoque')
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''))
  console.log('\nTODOS OS TESTES PASSARAM')
} catch (e) {
  await foto('erro').catch(() => {})
  console.error(e.message ?? e)
  process.exitCode = 1
} finally {
  await nav.close()
  servidor.kill()
}
