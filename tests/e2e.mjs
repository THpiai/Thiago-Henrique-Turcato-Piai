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
    { id: 't4', nome: 'T04 Nova', area_ha: 40, contorno: sq(-17.83, -50.92, 0.006), latitude: -17.827, longitude: -50.917, pluviometro: false, ativo: true },
    { id: 't3', nome: 'T03 Cana', area_ha: 120, contorno: sq(-17.81, -50.9, 0.01), latitude: -17.805, longitude: -50.895, pluviometro: false, ativo: true },
  ],
  insumos: [
    { id: 'i1', nome: 'Fungicida X', tipo: 'Defensivo', unidade: 'L', estoque_minimo: 50, ativo: true },
    { id: 'i2', nome: 'Inseticida Y', tipo: 'Defensivo', classe: 'Inseticida', unidade: 'L', estoque_minimo: 20, ativo: true },
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
const fotos = []
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
// Supabase simulado; vale para o contexto de computador e o de celular.
const supabaseSimulado = async (r) => {
  if (semSinal) return r.abort('internetdisconnected')
  const req = r.request(), url = new URL(req.url())
  const json = (corpo, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) })
  if (url.pathname.startsWith('/auth/v1/token')) {
    const agora = Math.floor(Date.now() / 1000)
    return json({ access_token: 'tok', token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: 'ref', user: { id: eu.id, email: eu.email, aud: 'authenticated', role: 'authenticated' } })
  }
  if (url.pathname.startsWith('/auth/v1/')) return json({})
  if (url.pathname.startsWith('/storage/v1/object')) {
    fotos.push(url.pathname)
    return json({ Key: url.pathname.split('/object/')[1] })
  }
  const tabela = url.pathname.split('/').pop()
  if (req.method() === 'PATCH') {
    const id = url.searchParams.get('id').replace(/^eq\./, '')
    const campos = JSON.parse(req.postData())
    recebidos.push({ tabela, op: 'update', linhas: [{ id, ...campos }] })
    const l = (banco[tabela] ?? []).find((x) => x.id === id)
    if (l) Object.assign(l, campos)
    return r.fulfill({ status: 204, body: '' })
  }
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
}
await ctx.route(/arcgisonline|openstreetmap/, (r) => r.abort())
await ctx.route(/supabase\.co/, supabaseSimulado)

console.log('navegador ok')
const pagina = await ctx.newPage()
const erros = []
pagina.on('pageerror', (e) => erros.push(String(e)))
// Regra de segurança (CSP) bloqueando algo do próprio app também é erro.
pagina.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) erros.push(m.text()) })
const foto = (n) => pagina.screenshot({ path: `${SAIDA}/${n}.png` })
const espera = (t, ms = 10000) => pagina.getByText(t).first().waitFor({ timeout: ms })
const ok = (cond, msg) => { if (!cond) throw new Error('FALHOU: ' + msg); console.log('✔', msg) }

try {
  await pagina.goto(BASE)
  await pagina.getByAltText('PIAI – Fazenda Controle Total').waitFor()
  ok(await pagina.title() === 'PIAI – Fazenda Controle Total', 'entrada com a logo e o nome PIAI')
  await foto('0-entrada')
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

  // Filtro de talhões estilo BI: atalho por cultura, vale no Início e na Safra, fica guardado e limpa com um toque.
  await pagina.getByRole('button', { name: /Todos os talhões/ }).click()
  await pagina.getByRole('dialog', { name: 'Escolher talhões' }).waitFor()
  await pagina.getByRole('button', { name: /^Soja 2/ }).click()
  await pagina.getByPlaceholder('Buscar talhão').fill('baixada')
  ok(await pagina.locator('.lista-marcar li').count() === 1, 'busca no seletor acha o talhão sem diferença de maiúscula')
  await pagina.getByPlaceholder('Buscar talhão').fill('')
  await foto('1b-filtro-talhoes')
  await pagina.getByRole('button', { name: 'Mostrar 2 talhões' }).click()
  await espera('2 de 4 talhões')
  await pagina.waitForTimeout(300)
  await foto('1c-inicio-filtrado')
  ok(await pagina.locator('.grade-talhoes .talhao').count() === 2, 'Início mostra só os talhões escolhidos')
  ok(await pagina.locator('.kpis').getByText('ha em 2 talhões escolhidos').count() === 1, 'números do Início seguem o filtro')
  await pagina.reload()
  await espera('2 de 4 talhões')
  ok(true, 'filtro continua depois de reabrir o app')
  await pagina.locator('.abas').getByRole('button', { name: 'Safra', exact: true }).click()
  await espera('Soja 2026/27')
  await espera('2 de 4 talhões')
  await pagina.waitForTimeout(300)
  await foto('1d-safra-filtrada')
  await pagina.locator('.abas').getByRole('button', { name: /Início/ }).click()
  await pagina.getByRole('button', { name: /Limpar filtro/ }).click()
  await espera('Todos os talhões')
  ok(await pagina.locator('.grade-talhoes .talhao').count() === 4, 'Limpar volta a mostrar todos')

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
  ok(await pagina.getByRole('checkbox', { name: /T01 Sede/ }).isChecked(), 'GPS marcou o talhão sozinho')
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
  await espera('Olá, Thiago')

  // Validação: valor absurdo não é salvo e a pessoa vê o motivo.
  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Chuva/ }).click()
  await pagina.getByPlaceholder('mm').first().fill('900')
  await pagina.getByRole('button', { name: 'Salvar leituras' }).click()
  await espera('Não salvei. Chuva (mm): use um valor entre 0 e 400.')
  ok((await pagina.evaluate(() => new Promise((ok) => { const r = indexedDB.open('flor-da-mata'); r.onsuccess = () => { const t = r.result.transaction('fila').objectStore('fila').count(); t.onsuccess = () => ok(t.result) } }))) === 2,
    'chuva de 900 mm recusada antes de entrar na fila')

  // Chuva lida na sede Carlim: um registro da sede, que vale para os talhões mais próximos dela.
  await espera('Pluviômetro das sedes')
  await pagina.getByLabel('Chuva na sede Carlim (mm)').fill('25')
  await foto('2a-chuva-por-sede')
  await pagina.getByRole('button', { name: 'Salvar leituras' }).click()
  await espera('Chuva salva.')
  const naFila = await pagina.evaluate(() => new Promise((ok) => { const r = indexedDB.open('flor-da-mata'); r.onsuccess = () => { const t = r.result.transaction('chuva').objectStore('chuva').getAll(); t.onsuccess = () => ok(t.result) } }))
  ok(naFila.some((c) => c.sede_id === 's2' && c.talhao_id == null && Number(c.milimetros) === 25 && c.fonte === 'Pluviômetro'), 'chuva da sede Carlim gravada com a sede escolhida')
  await espera('Olá, Thiago')

  // Problema registrado rápido, ainda sem sinal: tipo, nome, gravidade, quem viu e foto.
  const t0 = Date.now()
  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Problema/ }).click()
  await espera('Você está no T01 Sede')
  await pagina.getByRole('radio', { name: 'Praga' }).click()
  await pagina.getByLabel('Nome, se souber').fill('Lagarta-falsa-medideira')
  await pagina.getByRole('radio', { name: 'Alta' }).click()
  await pagina.getByRole('radio', { name: 'Vendedor' }).click()
  await pagina.locator('input[type=file]').setInputFiles({ name: 'lagarta.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqP9fDwAEfQHy3WjvzQAAAABJRU5ErkJggg==', 'base64') })
  await pagina.getByAltText('Foto do problema').waitFor()
  await foto('2b-problema-sem-sinal')
  await pagina.getByRole('button', { name: 'Salvar problema' }).click()
  await espera('3 guardado(s) no celular')
  ok(Date.now() - t0 < 60000, `problema registrado sem sinal em ${Math.round((Date.now() - t0) / 1000)} s`)
  await espera('Olá, Thiago')

  // Fecha e reabre o app sem sinal: tudo continua lá.
  await pagina.reload()
  await espera('3 guardado(s) no celular')
  ok(true, 'reabriu sem sinal com os registros guardados')
  await pagina.getByRole('button', { name: /T01 Sede/ }).click()
  await espera('Pulverização · Ferrugem-asiática')
  await espera('Fungicida X 0,6 L/ha')
  await espera('Aplicações desta safra')
  ok(await pagina.locator('.aplicacoes li', { hasText: 'Ferrugem-asiática' }).locator('.selo', { hasText: 'Fora da faixa' }).isVisible(), 'aplicação com vento de 14 km/h aparece fora da faixa no talhão')
  await pagina.locator('section', { has: pagina.locator('.aplicacoes') }).screenshot({ path: `${SAIDA}/3a-aplicacoes-talhao.png` })
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
  const chuvaSede = recebidos.filter((r) => r.tabela === 'chuva').flatMap((r) => r.linhas).find((c) => c.sede_id === 's2')
  ok(chuvaSede && chuvaSede.talhao_id == null && chuvaSede.fonte === 'Pluviômetro', 'chuva da sede Carlim subiu para o servidor')
  const prob = recebidos.find((r) => r.tabela === 'campo').linhas[0]
  ok(prob.gravidade === 'Alta' && prob.quem_viu === 'Vendedor' && prob.latitude && prob.foto_path === `campo/${prob.id}.jpg`, 'problema chegou com gravidade, quem viu, ponto e foto')
  for (let i = 0; i < 50 && !fotos.length; i++) await pagina.waitForTimeout(200)
  ok(fotos.some((f) => f.includes(prob.id)), 'foto subiu para o servidor depois do registro')

  // Mapa da safra: T01 ficou crítico pelo problema grave aberto (a lagarta veio depois da aplicação de fungicida).
  await pagina.locator('.abas').getByRole('button', { name: 'Safra', exact: true }).click()
  await espera('Soja 2026/27')
  await pagina.locator('.mapa-safra path.leaflet-interactive').first().waitFor()
  const corT01 = async () => pagina.locator('.linha-talhao', { hasText: 'T01 Sede' }).getAttribute('class')
  ok((await corT01()).includes('critico'), 'T01 ficou crítico na safra com a praga grave')
  ok(await pagina.locator('.mapa-safra path[fill="#d6452f"]').count() >= 2, 'mapa da safra pinta de vermelho os talhões críticos')
  await foto('4b-safra')

  // Aplicação de inseticida depois do problema: vira "em tratamento" e o alerta sai.
  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Operação/ }).click()
  await espera('Você está no T01 Sede')
  await pagina.getByRole('radio', { name: 'Pulverização' }).click()
  await pagina.getByRole('button', { name: '+ Produto' }).click()
  await pagina.getByLabel('Insumo').selectOption('i2')
  await pagina.getByLabel('Dose por hectare').fill('0,2')
  await pagina.getByRole('button', { name: 'Salvar operação' }).click()
  await espera('Olá, Thiago')
  await pagina.locator('.abas').getByRole('button', { name: 'Safra', exact: true }).click()
  await espera('Soja 2026/27')
  ok(!(await corT01()).includes('critico'), 'aplicação de inseticida tirou o T01 do crítico')
  await pagina.getByRole('button', { name: /T01 Sede/ }).first().click()
  await espera('Em tratamento')
  await espera('Tratado com Inseticida Y')
  await espera('estimado')
  await pagina.getByRole('button', { name: 'Confirmar estádio' }).click()
  await pagina.getByRole('button', { name: 'Vegetativo (V)' }).click()
  await pagina.locator('.estadio.confirmado').first().waitFor()
  ok(true, 'estádio estimado e confirmado aparecem diferentes')
  await foto('4c-talhao-em-tratamento')

  await pagina.getByRole('button', { name: /Início/ }).click()
  await espera('problemas abertos')
  await foto('4-inicio-depois')
  await pagina.getByRole('button', { name: /Mais/ }).click()
  await pagina.getByRole('button', { name: /Mapa dos talhões/ }).click()
  await pagina.waitForFunction(() => document.querySelectorAll('path.leaflet-interactive').length >= 3, null, { timeout: 10000 }).catch(() => {})
  ok(await pagina.locator('path.leaflet-interactive').count() >= 3, 'mapa desenha os talhões')
  await foto('5-mapa')
  await pagina.getByRole('button', { name: /Estoque/ }).click()
  await espera('Inseticida Y')
  await foto('6-estoque')

  // Computador: editor de talhão no estilo SmartFarm.
  await pagina.setViewportSize({ width: 1366, height: 860 })
  await pagina.getByRole('button', { name: /Mapa/ }).first().click()
  await pagina.locator('.lista-talhoes button', { hasText: 'T01 Sede' }).click()
  await pagina.getByRole('button', { name: /Editar contorno/ }).click()
  await pagina.locator('.vertice').first().waitFor()
  ok(await pagina.locator('.vertice').count() === 4, 'editor abre com os 4 pontos do talhão')
  await pagina.waitForTimeout(900) // espera o mapa terminar de enquadrar o talhão
  const areaAntes = await pagina.locator('.medidas b').first().innerText()
  const v = await pagina.locator('.vertice').nth(0).boundingBox()
  await pagina.mouse.move(v.x + v.width / 2, v.y + v.height / 2)
  await pagina.mouse.down()
  await pagina.mouse.move(v.x + v.width / 2 - 50, v.y + v.height / 2 + 30, { steps: 8 })
  await pagina.mouse.up()
  const areaDepois = await pagina.locator('.medidas b').first().innerText()
  ok(await pagina.locator('.vertice').count() === 4, 'arrastar não cria ponto extra')
  ok(areaAntes !== areaDepois, `arrastar ponto muda a área (${areaAntes} → ${areaDepois} ha)`)
  await pagina.locator('.vertice-meio').first().click()
  const nPts = await pagina.locator('.vertice').count()
  ok(nPts === 5, `o + entre dois pontos insere um ponto (${nPts})`)
  await pagina.getByRole('button', { name: /Apagar/ }).click()
  ok(await pagina.locator('.vertice').count() === 4, 'apagar remove o ponto selecionado')
  await pagina.keyboard.press('Control+z')
  ok(await pagina.locator('.vertice').count() === 5, 'Ctrl+Z desfaz')
  await foto('7-editor-computador')
  await pagina.getByRole('button', { name: /Concluir/ }).click()
  await pagina.getByRole('button', { name: 'Salvar talhão' }).click()
  for (let i = 0; i < 50 && !recebidos.some((r) => r.tabela === 'talhoes'); i++) await pagina.waitForTimeout(200)
  const t1 = recebidos.filter((r) => r.tabela === 'talhoes').pop()?.linhas[0]
  ok(t1?.id === 't1' && t1.contorno.coordinates[0].length === 6, 'contorno editado subiu com 5 pontos')
  await pagina.getByRole('button', { name: /Início/ }).first().click()
  await espera('Clima nas sedes')
  await foto('8-inicio-computador')


  // Apagar com confirmação, desfazer, e lixeira.
  await pagina.getByRole('button', { name: /Início/ }).first().click()
  await pagina.getByRole('button', { name: /T01 Sede/ }).click()
  const linhaOp = pagina.locator('.tempo li', { hasText: 'Pulverização · Ferrugem-asiática' })
  await linhaOp.getByRole('button', { name: /Apagar operação/ }).click()
  await espera('Os insumos voltam ao estoque')
  await linhaOp.getByRole('button', { name: 'Apagar', exact: true }).click()
  await espera('Operação apagada')
  ok(await pagina.locator('.tempo li', { hasText: 'Ferrugem-asiática' }).count() === 0, 'operação some da linha do tempo')
  await pagina.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await pagina.locator('.tempo li', { hasText: 'Ferrugem-asiática' }).waitFor()
  ok(true, 'Desfazer traz a operação de volta')
  await pagina.locator('.tempo li', { hasText: 'Ferrugem-asiática' }).getByRole('button', { name: /Apagar operação/ }).click()
  await pagina.locator('.tempo li', { hasText: 'Ferrugem-asiática' }).getByRole('button', { name: 'Apagar', exact: true }).click()
  await pagina.getByRole('button', { name: /Arquivar talhão/ }).click()
  await pagina.locator('.zona-perigo').getByRole('button', { name: 'Apagar', exact: true }).click()
  await espera('T01 Sede arquivado')
  await pagina.locator('.secundarias').getByRole('button', { name: /Lixeira/ }).click()
  await espera('Talhão arquivado')
  await espera('Pulverização · Ferrugem-asiática')
  await foto('9-lixeira')
  await pagina.locator('.lista li', { hasText: 'Talhão arquivado' }).getByRole('button', { name: 'Restaurar' }).click()
  for (let i = 0; i < 50 && !recebidos.some((r) => r.tabela === 'talhoes' && r.op === 'update' && r.linhas[0].ativo === true); i++) await pagina.waitForTimeout(200)
  const upd = recebidos.filter((r) => r.op === 'update').map((r) => `${r.tabela}:${Object.keys(r.linhas[0]).filter((k) => k !== 'id').join(',')}`)
  ok(upd.includes('operacoes:excluido_em') && upd.includes('talhoes:ativo'), `servidor recebeu só as marcas de lixeira (${upd.join(' · ')})`)
  ok(banco.operacoes.find((o) => o.tipo === 'Pulverização').excluido_em, 'operação ficou na lixeira no servidor')
  ok(banco.talhoes.find((t) => t.id === 't1').ativo === true, 'talhão restaurado no servidor')

  // Safra automática: Plantio num talhão sem safra cria a safra, e o estado da safra sai dos registros.
  await pagina.locator('.abas').getByRole('button', { name: /Início/ }).click()
  await espera('T02 Baixada')
  ok(await pagina.locator('.talhao', { hasText: 'T02 Baixada' }).locator('.selo.critico').count() === 1, 'talhão com problema grave aberto aparece como crítico no início')
  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Operação/ }).click()
  await espera('Você está no T01 Sede')
  await pagina.getByRole('button', { name: 'Limpar', exact: true }).click()
  await pagina.getByRole('checkbox', { name: /T04 Nova/ }).check()
  await pagina.getByRole('radio', { name: 'Plantio' }).click()
  await espera('sem safra: escolha a cultura')
  ok(await pagina.getByRole('button', { name: 'Salvar operação' }).isDisabled(), 'plantio sem safra pede a cultura')
  ok((await pagina.getByLabel('Área em T04 Nova (ha)').inputValue()) === '40', 'área acompanha o talhão escolhido')
  await pagina.getByRole('radio', { name: 'Soja' }).click()
  await pagina.getByLabel('Variedade principal').fill('BRS 7980')
  await pagina.getByRole('button', { name: /Também entrou outra variedade/ }).click()
  await pagina.getByLabel('Outra variedade').fill('TMG 2383')
  await pagina.getByLabel('Quantidade de semente').fill('3 bags')
  await foto('10-plantio-cria-safra')
  await pagina.getByRole('button', { name: 'Salvar operação' }).click()
  for (let i = 0; i < 50 && !(banco.operacoes ?? []).some((o) => o.tipo === 'Plantio'); i++) await pagina.waitForTimeout(200)
  const plantio = banco.operacoes.find((o) => o.tipo === 'Plantio')
  ok(plantio.cultura === 'Soja' && plantio.cultivar === 'BRS 7980' && plantio.ciclo_id, 'plantio subiu com cultura, cultivar e o id da safra nova')
  ok(plantio.sobras?.[0]?.cultivar === 'TMG 2383' && plantio.sobras[0].sementes === '3 bags' && plantio.em_andamento === false, 'sobra de outra variedade subiu com o plantio')
  ok(!recebidos.some((r) => r.tabela === 'ciclos'), 'operador não precisa gravar a safra: o servidor cria pelo plantio')
  await espera('Olá, Thiago')
  await pagina.getByRole('button', { name: /T04 Nova/ }).click()
  await espera('Estado da safra')
  await espera('Soja 2026/27')
  await espera('1 plantio')
  ok(await pagina.getByText('BRS 7980').count() > 0, 'safra aparece no talhão com a cultivar do plantio')
  await espera('Ficha do talhão por safra')
  await espera('Com sobra de: TMG 2383 · 3 bags')
  ok(true, 'ficha do talhão mostra a variedade principal e a sobra')
  await foto('11-estado-safra')
  await pagina.getByRole('button', { name: '‹ Voltar' }).click()
  await pagina.getByRole('button', { name: /T02 Baixada/ }).click()
  await espera('Ponto de atenção agora')
  await espera('Percevejo-marrom (alta)')
  await foto('12-estado-safra-critico')

  // Operação em vários talhões, em andamento, com o mapa ao lado; depois fecha no Início.
  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Operação/ }).click()
  await espera('Você está no T01 Sede')
  await pagina.getByLabel('Buscar talhão').fill('baix')
  await pagina.getByLabel('Buscar talhão').press('Enter')
  ok(await pagina.getByRole('checkbox', { name: /T02 Baixada/ }).isChecked(), 'busca + Enter marca o talhão encontrado')
  await pagina.getByLabel('Buscar talhão').fill('')
  await pagina.getByRole('radio', { name: 'Adubação' }).click()
  await espera('Adubação: 0 feito · 0 em andamento · 3 falta')
  ok(await pagina.locator('.mapa-op path.talhao-marcado').count() === 2, 'mapa acende os dois talhões marcados')
  await pagina.getByRole('radio', { name: 'Ainda em andamento' }).click()
  await pagina.getByRole('button', { name: '+ Produto' }).click()
  await pagina.getByLabel('Insumo').selectOption('i1')
  await pagina.getByLabel('Dose por hectare').fill('1')
  await espera('Total: 147,27 L em 2 talhões')
  await foto('14-operacao-varios-talhoes')
  await pagina.getByRole('button', { name: 'Salvar em 2 talhões' }).click()
  await espera('2 operações salvas, uma por talhão')
  for (let i = 0; i < 50 && (banco.operacoes ?? []).filter((o) => o.tipo === 'Adubação').length < 2; i++) await pagina.waitForTimeout(200)
  const adub = banco.operacoes.filter((o) => o.tipo === 'Adubação')
  ok(adub.length === 2 && adub.every((o) => o.em_andamento && o.lote_id && o.lote_id === adub[0].lote_id), 'uma operação por talhão, no mesmo lote, em andamento')
  await espera('Olá, Thiago')
  await espera('Em andamento')
  const lote = pagina.locator('.em-andamento li', { hasText: 'Adubação' })
  await lote.getByRole('button', { name: 'Terminou' }).click()
  await pagina.getByLabel('Área feita em T02 Baixada').fill('50')
  await foto('15-terminar-operacao')
  await pagina.getByRole('button', { name: 'Confirmar término' }).click()
  for (let i = 0; i < 50 && recebidos.filter((r) => r.op === 'update' && r.tabela === 'operacoes' && r.linhas[0].em_andamento === false).length < 2; i++) await pagina.waitForTimeout(200)
  const fechou = recebidos.filter((r) => r.op === 'update' && r.tabela === 'operacoes' && r.linhas[0].em_andamento === false).map((r) => r.linhas[0])
  ok(fechou.length === 2 && fechou.some((l) => l.area_ha === 50) && fechou.every((l) => l.data_fim), 'término subiu com a data e a área feita corrigida')
  ok(await pagina.locator('.em-andamento li', { hasText: 'Adubação' }).count() === 0, 'operação sai de "em andamento" depois de terminar')

  // Padrão mercado no cadastro de insumo.
  await pagina.locator('.secundarias').getByRole('button', { name: /Insumos/ }).click()
  await pagina.getByRole('button', { name: '+ Insumo' }).click()
  await pagina.getByLabel('Nome comercial').fill('Fox Xpro')
  ok(await pagina.getByRole('button', { name: 'Salvar', exact: true }).isDisabled(), 'insumo pede a classe')
  await espera('Padrão mercado encontrado')
  await espera('(padrão mercado: R$ 268,00/L')
  await foto('13-insumo-padrao-mercado')
  await pagina.getByRole('button', { name: 'Preencher o que está vazio' }).click()
  ok((await pagina.getByLabel(/^Preço/).inputValue()) === '268', 'preço de referência preenchido com um toque')
  await pagina.getByRole('button', { name: 'Salvar', exact: true }).click()
  for (let i = 0; i < 50 && !recebidos.some((r) => r.tabela === 'insumos'); i++) await pagina.waitForTimeout(200)
  const ins = recebidos.find((r) => r.tabela === 'insumos').linhas[0]
  ok(ins.preco_unitario === 268 && ins.unidade === 'L' && ins.tipo === 'Defensivo' && ins.dose_ha_padrao === 0.5 && ins.classe === 'Fungicida', `insumo subiu com dados de mercado (${ins.ingrediente_ativo})`)

  // Repetidos que já estão no servidor (como os 45 do celular sem sinal) chegam na próxima sincronização.
  for (const id of ['d1', 'd2', 'd3']) banco.insumos.push({ id, nome: 'Glifosato Repetido', tipo: 'Defensivo', classe: 'Herbicida', unidade: 'L', ativo: true })
  await pagina.getByTestId('sync').last().click()
  await espera('Glifosato Repetido')

  // Sem sinal: salvar insumo dá retorno na hora, toque repetido não duplica e nome repetido é barrado.
  semSinal = true
  await ctx.setOffline(true)
  await pagina.waitForFunction(() => !navigator.onLine)
  await pagina.getByRole('button', { name: '+ Insumo' }).click()
  await pagina.getByLabel('Nome comercial').fill('fox xpro ')
  await espera('Já existe um insumo com esse nome')
  ok(await pagina.getByRole('button', { name: 'Salvar', exact: true }).isDisabled(), 'nome já cadastrado não deixa salvar de novo')
  await pagina.getByRole('button', { name: 'Abrir o que já existe' }).click()
  await espera('Apagar insumo')
  await pagina.getByRole('button', { name: '‹ Insumos' }).click()
  await pagina.getByRole('button', { name: '+ Insumo' }).click()
  await pagina.getByLabel('Nome comercial').fill('80I82RSF IPRO - Olimpo')
  await pagina.getByRole('radio', { name: 'Semente' }).first().click()
  await pagina.getByRole('radio', { name: 'kg' }).click()
  await pagina.getByRole('radio', { name: 'Semente' }).last().click()
  const salvarIns = pagina.getByRole('button', { name: 'Salvar', exact: true })
  await salvarIns.click({ clickCount: 5, delay: 5 }).catch(() => {})
  await espera('Insumo cadastrado no celular. Sobe sozinho quando tiver sinal.')
  const olimpos = await pagina.evaluate(() => new Promise((ok) => { const r = indexedDB.open('flor-da-mata'); r.onsuccess = () => { const t = r.result.transaction('insumos').objectStore('insumos').getAll(); t.onsuccess = () => ok(t.result.filter((i) => /olimpo/i.test(i.nome)).length) } }))
  ok(olimpos === 1, 'vários toques em Salvar sem sinal gravam um insumo só')

  // Repetidos que já existiam: um toque deixa um só e manda o resto para a lixeira.
  // (Os toques que sobram no Salvar podem cair na lista e abrir um insumo: volta para a lista.)
  await pagina.waitForTimeout(300)
  if (await pagina.getByRole('button', { name: '‹ Insumos' }).isVisible()) await pagina.getByRole('button', { name: '‹ Insumos' }).click()
  await espera('2 insumo(s) repetido(s)')
  await foto('16-insumos-repetidos')
  await pagina.getByRole('button', { name: /Deixar um só/ }).click()
  await espera('2 repetido(s) na lixeira')
  ok(await pagina.locator('.lista li', { hasText: 'Glifosato Repetido' }).count() === 1, 'sobra um só Glifosato Repetido')

  // Apagar insumo cadastrado errado (vai para a lixeira e volta).
  await pagina.locator('.lista li', { hasText: '80I82RSF' }).click()
  await pagina.getByRole('button', { name: 'Apagar insumo' }).click()
  await pagina.getByRole('alertdialog').getByRole('button', { name: 'Apagar' }).click()
  await espera('Insumo apagado')
  ok(await pagina.locator('.lista li', { hasText: '80I82RSF' }).count() === 0, 'insumo apagado some da lista')
  await pagina.getByRole('button', { name: '‹ Mais' }).click()
  await pagina.getByRole('button', { name: /Lixeira/ }).first().click()
  await espera('80I82RSF IPRO - Olimpo')
  ok(await pagina.locator('.lista li', { hasText: 'Insumo' }).count() === 3, 'insumos apagados aparecem na lixeira')
  semSinal = false
  await ctx.setOffline(false)
  for (let i = 0; i < 50 && recebidos.filter((r) => r.tabela === 'insumos' && r.op === 'update' && r.linhas[0].excluido_em).length < 3; i++) await pagina.waitForTimeout(200)
  ok(recebidos.filter((r) => r.tabela === 'insumos' && r.op === 'update' && r.linhas[0].excluido_em).length === 3, 'ao voltar o sinal, os apagados sobem para a lixeira do servidor')
  ok(recebidos.filter((r) => r.tabela === 'insumos' && !r.op).flatMap((r) => r.linhas).filter((l) => /olimpo/i.test(l.nome)).length === 1, 'servidor recebe o insumo uma vez só')

  // Celular de verdade (toque, zoom do navegador): o Mapa não pode virar "versão de computador" ao criar talhão.
  const cel = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    geolocation: { latitude: -17.79, longitude: -50.91, accuracy: 6 }, permissions: ['geolocation'],
  })
  await cel.route(/arcgisonline|openstreetmap/, (r) => r.abort())
  await cel.route(/supabase\.co/, supabaseSimulado)
  const tel = await cel.newPage()
  tel.on('pageerror', (e) => erros.push(String(e)))
  const fotoCel = (n) => tel.screenshot({ path: `${SAIDA}/${n}.png` })
  const larguraTela = () => tel.evaluate(() => document.documentElement.scrollWidth)
  await tel.goto(BASE)
  await tel.getByLabel('E-mail').fill(eu.email)
  await tel.getByLabel('Senha').fill('senha-de-teste')
  await tel.getByRole('button', { name: 'Entrar' }).tap()
  await tel.getByText('Olá, Thiago').first().waitFor()
  await tel.getByRole('button', { name: /Mais/ }).tap()
  await tel.getByRole('button', { name: /Mapa dos talhões/ }).tap()
  await tel.locator('.leaflet-interactive').first().waitFor()
  await tel.waitForTimeout(600)
  await fotoCel('celular-1-mapa')
  await tel.getByRole('button', { name: /Novo talhão/ }).tap()
  await tel.waitForTimeout(400)
  ok(await larguraTela() === 390, `celular: criar talhão não alarga a tela (${await larguraTela()} px)`)
  ok(await tel.locator('[data-testid="mapa"].leaflet-container').count() === 1, 'celular: mapa mantém o modo de toque do Leaflet ao editar')
  for (const [x, y] of [[110, 170], [280, 180], [290, 360], [120, 350]]) { await tel.touchscreen.tap(x, y); await tel.waitForTimeout(250) }
  ok(await tel.locator('.vertice').count() === 4, 'celular: 4 toques no mapa marcam 4 pontos')
  ok(await larguraTela() === 390, 'celular: tela continua do tamanho do celular depois dos toques')
  await fotoCel('celular-2-desenhando')
  await tel.getByRole('button', { name: /Concluir/ }).tap()
  await tel.getByLabel('Nome do talhão').fill('T05 Celular')
  await fotoCel('celular-3-nome')
  await tel.getByRole('button', { name: 'Salvar talhão' }).tap()
  await tel.getByText('Talhão salvo').first().waitFor()
  for (let i = 0; i < 50 && !banco.talhoes.some((t) => t.nome === 'T05 Celular'); i++) await tel.waitForTimeout(200)
  const t5 = banco.talhoes.find((t) => t.nome === 'T05 Celular')
  ok(t5 && t5.contorno.coordinates[0].length === 5 && t5.area_ha > 0, `celular: talhão desenhado por toque chega ao servidor (${t5?.area_ha} ha)`)

  // Andando a divisa com o GPS: um ponto a cada 10 m.
  await tel.getByRole('button', { name: /Novo talhão/ }).tap()
  await tel.getByRole('button', { name: /Andar/ }).tap()
  const passo = 0.0002 // ~22 m: quadrado de ~66 m de lado
  for (const [dl, dg] of [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0]]) {
    await cel.setGeolocation({ latitude: -17.79 + dl * passo, longitude: -50.91 + dg * passo, accuracy: 6 })
    await tel.waitForTimeout(250)
  }
  const nAndando = await tel.locator('.vertice').count()
  ok(nAndando >= 10, `celular: andar com o GPS marca a divisa sozinho (${nAndando} pontos)`)
  await fotoCel('celular-4-andando')
  await tel.getByRole('button', { name: /Parar/ }).tap()
  await tel.getByRole('button', { name: /Concluir/ }).tap()
  await tel.getByLabel('Nome do talhão').fill('T06 Andando')
  await tel.getByRole('button', { name: 'Salvar talhão' }).tap()
  for (let i = 0; i < 50 && !banco.talhoes.some((t) => t.nome === 'T06 Andando'); i++) await tel.waitForTimeout(200)
  const t6 = banco.talhoes.find((t) => t.nome === 'T06 Andando')
  ok(t6 && t6.area_ha > 0.3 && t6.area_ha < 0.6, `celular: talhão andado com GPS chega ao servidor (${t6?.area_ha} ha)`)
  await tel.locator('.leaflet-interactive').first().waitFor()
  await tel.waitForTimeout(400)
  await fotoCel('celular-5-salvos')
  await cel.close()

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
