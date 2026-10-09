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
})

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
  await espera('Olá, Thiago')

  // Validação: valor absurdo não é salvo e a pessoa vê o motivo.
  await pagina.getByRole('button', { name: /Registrar/ }).click()
  await pagina.getByRole('button', { name: /Chuva/ }).click()
  await pagina.getByPlaceholder('mm').first().fill('900')
  await pagina.getByRole('button', { name: 'Salvar leituras' }).click()
  await espera('Não salvei. Chuva (mm): use um valor entre 0 e 400.')
  ok((await pagina.evaluate(() => new Promise((ok) => { const r = indexedDB.open('flor-da-mata'); r.onsuccess = () => { const t = r.result.transaction('fila').objectStore('fila').count(); t.onsuccess = () => ok(t.result) } }))) === 2,
    'chuva de 900 mm recusada antes de entrar na fila')

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
  await espera('2 guardado(s) no celular')
  ok(Date.now() - t0 < 60000, `problema registrado sem sinal em ${Math.round((Date.now() - t0) / 1000)} s`)
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
  await pagina.locator('.leaflet-interactive').first().waitFor()
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
  await pagina.locator('form select').first().selectOption('t4')
  await pagina.getByRole('radio', { name: 'Plantio' }).click()
  await espera('não tem safra aberta')
  ok(await pagina.getByRole('button', { name: 'Salvar operação' }).isDisabled(), 'plantio sem safra pede a cultura')
  ok((await pagina.getByLabel('Área feita (ha)').inputValue()) === '40', 'área acompanha o talhão escolhido')
  await pagina.getByRole('radio', { name: 'Soja' }).click()
  await pagina.getByLabel('Cultivar / variedade').fill('BRS 7980')
  await foto('10-plantio-cria-safra')
  await pagina.getByRole('button', { name: 'Salvar operação' }).click()
  for (let i = 0; i < 50 && !(banco.operacoes ?? []).some((o) => o.tipo === 'Plantio'); i++) await pagina.waitForTimeout(200)
  const plantio = banco.operacoes.find((o) => o.tipo === 'Plantio')
  ok(plantio.cultura === 'Soja' && plantio.cultivar === 'BRS 7980' && plantio.ciclo_id, 'plantio subiu com cultura, cultivar e o id da safra nova')
  ok(!recebidos.some((r) => r.tabela === 'ciclos'), 'operador não precisa gravar a safra: o servidor cria pelo plantio')
  await espera('Olá, Thiago')
  await pagina.getByRole('button', { name: /T04 Nova/ }).click()
  await espera('Estado da safra')
  await espera('Soja 2026/27')
  await espera('1 plantio')
  ok(await pagina.getByText('BRS 7980').count() > 0, 'safra aparece no talhão com a cultivar do plantio')
  await foto('11-estado-safra')
  await pagina.getByRole('button', { name: '‹ Voltar' }).click()
  await pagina.getByRole('button', { name: /T02 Baixada/ }).click()
  await espera('Ponto de atenção agora')
  await espera('Percevejo-marrom (alta)')
  await foto('12-estado-safra-critico')

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
