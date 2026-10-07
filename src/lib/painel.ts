import { diasDesde } from './formato'
import type { Campo, Chuva, Ciclo, Operacao, OperacaoProduto, Saldo, Talhao } from './tipos'

export type Dados = {
  talhoes: Talhao[]; ciclos: Ciclo[]; operacoes: Operacao[]; produtos: OperacaoProduto[]
  campo: Campo[]; chuva: Chuva[]; saldos: Saldo[]
}

/** Ciclo que vale para o talhão agora: em andamento; senão o planejado; senão o último colhido. */
export function cicloAtual(talhaoId: string, ciclos: Ciclo[]): Ciclo | undefined {
  const doTalhao = ciclos.filter((c) => c.talhao_id === talhaoId)
  const ordem = { 'Em andamento': 0, Planejado: 1, Colhido: 2 } as const
  return doTalhao.sort((a, b) =>
    ordem[a.status] - ordem[b.status] || (b.data_plantio ?? '').localeCompare(a.data_plantio ?? ''))[0]
}

export const MIP_ATIVO = (c: Campo) => c.status !== 'Resolvida'

/** Chuva do talhão: pluviômetro dele quando há leitura no dia; senão a estimativa da fazenda. */
export function chuvaPeriodo(talhaoId: string, chuva: Chuva[], dias: number): number {
  const porDia = new Map<string, number>()
  const estimada = new Map<string, number>()
  for (const c of chuva) {
    const d = diasDesde(c.data)
    if (d == null || d < 0 || d >= dias) continue
    if (c.talhao_id === talhaoId && c.fonte === 'Pluviômetro') porDia.set(c.data, (porDia.get(c.data) ?? 0) + Number(c.milimetros))
    else if (!c.talhao_id) estimada.set(c.data, Number(c.milimetros))
  }
  let total = 0
  for (const [dia, mm] of estimada) if (!porDia.has(dia)) total += mm
  for (const mm of porDia.values()) total += mm
  return Math.round(total * 10) / 10
}

export type Resumo = {
  talhao: Talhao
  ciclo?: Ciclo
  dap: number | null              // dias após o plantio
  diasParaColheita: number | null
  progresso: number | null        // 0–1 do ciclo da cultivar
  ultimaOperacao?: Operacao
  alertas: Campo[]
  chuva7: number
  chuva30: number
  custoHa: number | null
  produtividade: number | null    // produção por hectare (sc/ha ou t/ha)
  vsMeta: number | null           // produtividade ÷ meta
}

export function resumoTalhao(t: Talhao, d: Dados): Resumo {
  const ciclo = cicloAtual(t.id, d.ciclos)
  const emCampo = ciclo?.status === 'Em andamento'
  const dap = emCampo ? diasDesde(ciclo?.data_plantio) : null
  const prevista = ciclo?.colheita_prevista
    ?? (ciclo?.data_plantio && ciclo.ciclo_cultivar_dias
      ? new Date(new Date(ciclo.data_plantio + 'T12:00:00').getTime() + ciclo.ciclo_cultivar_dias * 864e5).toISOString().slice(0, 10)
      : null)
  const faltam = emCampo && prevista ? -(diasDesde(prevista) ?? 0) : null
  const progresso = emCampo && dap != null && ciclo?.ciclo_cultivar_dias ? Math.min(1, Math.max(0, dap / ciclo.ciclo_cultivar_dias)) : null

  const ops = d.operacoes.filter((o) => o.talhao_id === t.id).sort((a, b) => b.data_hora.localeCompare(a.data_hora))
  const opsCiclo = ciclo ? ops.filter((o) => o.ciclo_id === ciclo.id) : []
  const custo = new Map(d.saldos.map((s) => [s.insumo_id, s.custo_medio ?? null]))
  let custoTotal = 0, temCusto = false
  const idsOps = new Set(opsCiclo.map((o) => o.id))
  for (const p of d.produtos) {
    if (!idsOps.has(p.operacao_id)) continue
    const cm = custo.get(p.insumo_id)
    const op = opsCiclo.find((o) => o.id === p.operacao_id)
    const qtd = p.quantidade_total ?? p.dose_ha * Number(op?.area_ha ?? t.area_ha)
    if (cm != null) { custoTotal += qtd * cm; temCusto = true }
  }
  const area = Number(t.area_ha)
  const produtividade = ciclo?.producao != null && area > 0 ? ciclo.producao / area : null

  return {
    talhao: t, ciclo, dap, diasParaColheita: faltam, progresso,
    ultimaOperacao: ops[0],
    alertas: d.campo.filter((c) => c.talhao_id === t.id && MIP_ATIVO(c))
      .sort((a, b) => peso(b) - peso(a)),
    chuva7: chuvaPeriodo(t.id, d.chuva, 7),
    chuva30: chuvaPeriodo(t.id, d.chuva, 30),
    custoHa: temCusto && area > 0 ? custoTotal / area : null,
    produtividade,
    vsMeta: produtividade != null && ciclo?.meta_por_ha ? produtividade / ciclo.meta_por_ha : null,
  }
}

const peso = (c: Campo) =>
  (c.status === 'Aplicação indicada' ? 10 : 0) + ({ Alta: 3, Média: 2, Baixa: 1 }[c.urgencia ?? 'Baixa'] ?? 0)

/** Situação do alerta MIP: o mesmo critério do gatilho do banco, para o celular mostrar na hora. */
export function statusMip(tipo: string, encontrado?: number | null, controle?: number | null): string {
  if (['Praga', 'Doença', 'Planta daninha'].includes(tipo) && encontrado != null && controle != null)
    return encontrado >= controle ? 'Aplicação indicada' : 'Monitorando'
  return 'Aberta'
}

export const abaixoDoMinimo = (s: Saldo) => s.estoque_minimo != null && Number(s.saldo) < Number(s.estoque_minimo)
