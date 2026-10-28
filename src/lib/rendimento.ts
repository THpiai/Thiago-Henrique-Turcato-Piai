import type { Ciclo, Operacao, Talhao } from './tipos'
import { chuvaEntre, precoInsumo, sedeDoTalhao, type Dados } from './painel'
import { diaLocal, grupoSafra, listaSafras, TIPOS_COLHEITA, type CicloVivo } from './safra'
import { operacoesDaSafra, TIPOS_APLICACAO } from './operacoes'
import { referenciaCultura } from './mercado'
import { DIAS_NO_CELULAR, naFaixa, type Faixa } from './periodo'
import { hojeISO } from './formato'

/**
 * Rendimento da safra estilo BI: uma linha por talhão (o ciclo dele na safra) e os números
 * somados por cultura. Grãos em sc/ha e cana em t/ha, nunca somados entre si.
 * Com faixa de datas, valem só as operações, colheitas e chuvas dentro dela.
 */
export type LinhaRend = {
  ciclo: CicloVivo; talhao: Talhao
  /** Área plantada: a informada na safra; senão a do talhão. */
  area: number
  areaColhida: number
  producao: number | null
  produtividade: number | null
  unidade: 'sc' | 't'
  custoHa: number | null
  custoEstimado: boolean
  /** Custo digitado na safra passada (sem as aplicações no app). */
  custoInformado: boolean
  /** mm no período; null quando o celular não tem a chuva dessas datas. */
  chuva: number | null
  operacoes: Operacao[]
}

const fimDe = (o: Operacao) => diaLocal(o.data_fim ?? o.data_hora)
const menosDias = (dia: string, n: number) => new Date(new Date(dia + 'T12:00:00Z').getTime() - n * 864e5).toISOString().slice(0, 10)
export const unidadeDe = (cultura: string): 'sc' | 't' => (cultura === 'Cana-de-açúcar' ? 't' : 'sc')

export function linhaRendimento(c: CicloVivo, t: Talhao, d: Dados, faixa: Faixa | null, hoje = hojeISO()): LinhaRend {
  const area = Number(c.area_ha ?? t.area_ha) || 0
  const todas = operacoesDaSafra(c, d.operacoes.filter((o) => o.talhao_id === t.id), d.ciclos)
  const ops = todas.filter((o) => naFaixa(diaLocal(o.data_hora), faixa) || (TIPOS_COLHEITA.includes(o.tipo) && naFaixa(fimDe(o), faixa)))

  // Produção: colheitas terminadas no período; sem colheita no app, a produção lançada na safra.
  let producao: number | null = null, areaColhida = 0
  if (todas.some((o) => TIPOS_COLHEITA.includes(o.tipo))) {
    for (const o of todas) {
      if (!TIPOS_COLHEITA.includes(o.tipo) || o.em_andamento || !naFaixa(fimDe(o), faixa)) continue
      areaColhida += Number(o.area_ha ?? 0)
      if (o.producao != null) producao = (producao ?? 0) + Number(o.producao)
    }
  } else if (c.producao != null && (c.status === 'Colhido' || c.data_colheita) && (faixa ? naFaixa(c.data_colheita, faixa) : true)) {
    producao = Number(c.producao)
    areaColhida = area
  }
  const produtividade = producao != null && areaColhida > 0 ? producao / areaColhida : null

  // Custo: insumos das operações no período; safra passada sem aplicações usa o custo informado.
  const ids = new Set(ops.map((o) => o.id))
  let total = 0, temCusto = false, custoEstimado = false
  for (const p of d.produtos) {
    if (!ids.has(p.operacao_id)) continue
    const preco = precoInsumo(p.insumo_id, d)
    if (!preco) continue
    const op = ops.find((o) => o.id === p.operacao_id)
    total += (p.quantidade_total ?? p.dose_ha * Number(op?.area_ha ?? area)) * preco.preco
    temCusto = true; custoEstimado ||= preco.estimado
  }
  const semAplicacoes = !d.produtos.some((p) => todas.some((o) => o.id === p.operacao_id))
  const custoInformado = semAplicacoes && c.custo_insumos_ha != null && (!faixa || naFaixa(c.data_colheita, faixa))
  const custoHa = custoInformado ? Number(c.custo_insumos_ha) : temCusto && area > 0 ? total / area : null

  // Chuva: no período; na safra inteira, do plantio à colheita (ou hoje).
  const fc = faixa ?? (c.data_plantio ? { de: c.data_plantio, ate: c.data_colheita ?? hoje } : null)
  // Sem nenhuma leitura nessas datas (safra lançada à mão, por exemplo) fica "sem dado", não 0 mm.
  const temLeitura = !!fc && d.chuva.some((x) => x.data >= fc.de && x.data <= fc.ate)
  const chuva = !fc || !temLeitura || fc.de < menosDias(hoje, DIAS_NO_CELULAR) ? null
    : chuvaEntre(t.id, d.chuva, (dia) => dia >= fc.de && dia <= fc.ate, sedeDoTalhao(t, d.sedes)?.id)

  return {
    ciclo: c, talhao: t, area, areaColhida: Math.min(areaColhida, area || areaColhida), producao, produtividade,
    unidade: c.unidade_producao ?? unidadeDe(c.cultura), custoHa, custoEstimado: !custoInformado && custoEstimado, custoInformado, chuva, operacoes: ops,
  }
}

/** O ciclo de cada talhão escolhido nesta safra (o mais novo, se houver dois). */
export function ciclosDaSafra(d: Dados, safra: string, talhoes: string[] | null): { c: CicloVivo; t: Talhao }[] {
  return d.talhoes.flatMap((t) => {
    if (talhoes && !talhoes.includes(t.id)) return []
    const c = (d.ciclos as CicloVivo[]).filter((x) => x.talhao_id === t.id && !x.excluido_em && grupoSafra(x) === safra)
      .sort((a, b) => (b.data_plantio ?? '').localeCompare(a.data_plantio ?? ''))[0]
    return c ? [{ c, t }] : []
  })
}

export const linhasDaSafra = (d: Dados, safra: string, talhoes: string[] | null, faixa: Faixa | null, hoje = hojeISO()) =>
  ciclosDaSafra(d, safra, talhoes).map(({ c, t }) => linhaRendimento(c, t, d, faixa, hoje))

export type KpiCultura = {
  cultura: string; unidade: 'sc' | 't'; area: number; areaColhida: number; producao: number | null
  /** Média ponderada pela área colhida. */
  produtividade: number | null
  custoHa: number | null; custoEstimado: boolean; custoInformado: boolean
  regional: { valor: number; fonte?: string } | null
  meta: number | null
  linhas: LinhaRend[]
}
export type Kpis = { area: number; areaColhida: number; custoHa: number | null; custoEstimado: boolean; custoInformado: boolean; chuva: number | null; culturas: KpiCultura[] }

/** Custo/ha da área: média pesada pela área dos talhões que têm custo. */
function custoMedio(ls: LinhaRend[]) {
  const com = ls.filter((l) => l.custoHa != null && l.area > 0)
  const area = com.reduce((s, l) => s + l.area, 0)
  return { custoHa: area ? com.reduce((s, l) => s + l.custoHa! * l.area, 0) / area : null, custoEstimado: com.some((l) => l.custoEstimado), custoInformado: com.some((l) => l.custoInformado) }
}

export function resumirRendimento(linhas: LinhaRend[]): Kpis {
  const porCultura = new Map<string, LinhaRend[]>()
  for (const l of linhas) porCultura.set(l.ciclo.cultura, [...(porCultura.get(l.ciclo.cultura) ?? []), l])
  const culturas = [...porCultura].filter(([c]) => c !== 'Pousio').map(([cultura, ls]): KpiCultura => {
    const comProd = ls.filter((l) => l.producao != null && l.areaColhida > 0)
    const prod = comProd.reduce((s, l) => s + l.producao!, 0)
    const areaProd = comProd.reduce((s, l) => s + l.areaColhida, 0)
    const ref = referenciaCultura(cultura, ls[0].ciclo.safra)
    const metas = [...new Set(ls.map((l) => l.ciclo.meta_por_ha).filter((m): m is number => m != null).map(Number))]
    return {
      cultura, unidade: ls[0].unidade, linhas: ls,
      area: ls.reduce((s, l) => s + l.area, 0), areaColhida: ls.reduce((s, l) => s + l.areaColhida, 0),
      producao: comProd.length ? prod : null, produtividade: areaProd > 0 ? prod / areaProd : null,
      ...custoMedio(ls),
      regional: ref?.produtividade_ha ? { valor: ref.produtividade_ha, fonte: ref.fonte?.split(';')[0].replace(/^Produtividade:\s*/, '') } : null,
      // Meta da cultura: só quando todos os talhões com meta usam a mesma.
      meta: metas.length === 1 ? metas[0] : null,
    }
  }).sort((a, b) => b.area - a.area)
  const chuvas = linhas.map((l) => l.chuva).filter((x): x is number => x != null)
  return {
    area: linhas.reduce((s, l) => s + l.area, 0), areaColhida: linhas.reduce((s, l) => s + l.areaColhida, 0),
    ...custoMedio(linhas), chuva: chuvas.length ? chuvas.reduce((s, x) => s + x, 0) / chuvas.length : null, culturas,
  }
}

/** Família da safra: Soja, Safrinha ou Cana (o comparativo só junta safras da mesma família). */
export const familiaSafra = (nome: string) => nome.split(' ')[0]
const anoSafra = (n: string) => Number(n.match(/\d{4}/)?.[0] ?? 0)

export type PontoHistorico = { safra: string; culturas: Map<string, KpiCultura>; custoHa: number | null }

/** As safras da mesma família, da mais antiga para a mais nova, com o rendimento da safra inteira. */
export function historicoSafras(d: Dados, safra: string, talhoes: string[] | null, hoje = hojeISO()): PontoHistorico[] {
  return listaSafras(d.ciclos).map((s) => s.nome).filter((n) => familiaSafra(n) === familiaSafra(safra))
    .sort((a, b) => anoSafra(a) - anoSafra(b))
    .map((n) => {
      const k = resumirRendimento(linhasDaSafra(d, n, talhoes, null, hoje))
      return { safra: n, culturas: new Map(k.culturas.map((c) => [c.cultura, c])), custoHa: k.custoHa }
    })
}

/** Safra anterior da mesma família (para a variação nos cartões). */
export function safraAnterior(hist: PontoHistorico[], safra: string): PontoHistorico | undefined {
  const i = hist.findIndex((h) => h.safra === safra)
  return i > 0 ? hist[i - 1] : undefined
}

export type Atividade = { operacoes: number; ha: number; aplicacoes: number; custo: number; custoEstimado: boolean; porTipo: { tipo: string; n: number; ha: number }[] }

/** O que foi feito no período: operações (e hectares) por tipo, aplicações e quanto de insumo entrou. */
export function atividade(ops: Operacao[], d: Pick<Dados, 'produtos' | 'saldos' | 'insumos' | 'talhoes'>): Atividade {
  const area = new Map(d.talhoes.map((t) => [t.id, Number(t.area_ha)]))
  const porTipo = new Map<string, { n: number; ha: number }>()
  let ha = 0
  for (const o of ops) {
    const a = Number(o.area_ha ?? area.get(o.talhao_id) ?? 0)
    ha += a
    const x = porTipo.get(o.tipo) ?? { n: 0, ha: 0 }
    porTipo.set(o.tipo, { n: x.n + 1, ha: x.ha + a })
  }
  const porId = new Map(ops.map((o) => [o.id, o]))
  let custo = 0, custoEstimado = false
  for (const p of d.produtos) {
    const o = porId.get(p.operacao_id)
    if (!o) continue
    const preco = precoInsumo(p.insumo_id, d)
    if (!preco) continue
    custo += (p.quantidade_total ?? p.dose_ha * Number(o.area_ha ?? area.get(o.talhao_id) ?? 0)) * preco.preco
    custoEstimado ||= preco.estimado
  }
  return {
    operacoes: ops.length, ha, custo, custoEstimado,
    aplicacoes: ops.filter((o) => TIPOS_APLICACAO.includes(o.tipo)).length,
    porTipo: [...porTipo].map(([tipo, x]) => ({ tipo, ...x })).sort((a, b) => b.ha - a.ha),
  }
}

/** Operações dentro da faixa (pelo dia em que começaram). */
export const opsNaFaixa = (ops: Operacao[], f: Faixa | null) => ops.filter((o) => !o.excluido_em && naFaixa(diaLocal(o.data_hora), f))

/** Datas da safra: 90 dias antes do primeiro plantio até a última colheita (ou hoje, se não acabou). */
export function faixaDaSafra(ciclos: Pick<Ciclo, 'data_plantio' | 'data_colheita' | 'status'>[], hoje = hojeISO()): Faixa | null {
  const plantios = ciclos.map((c) => c.data_plantio).filter((x): x is string => !!x).sort()
  if (!plantios.length) return null
  const acabou = ciclos.every((c) => c.status === 'Colhido' && c.data_colheita)
  return { de: menosDias(plantios[0], 90), ate: acabou ? ciclos.map((c) => c.data_colheita!).sort().at(-1)! : hoje }
}
