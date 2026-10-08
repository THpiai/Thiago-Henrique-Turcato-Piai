import base from './mercado.json'

/** Referência de mercado de um insumo (fonte pública, mostrada entre parênteses como "padrão mercado"). */
export type RefInsumo = {
  nome: string; fabricante?: string | null; ingrediente_ativo?: string | null; tipo: string; classe?: string | null
  unidade: string; dose_min_ha?: number | null; dose_max_ha?: number | null; culturas?: string[]
  preco?: number | null; preco_fonte?: string | null; preco_url?: string | null; preco_data?: string | null; dose_fonte?: string | null
}
export type RefCultura = {
  ciclo_dias?: number | null; ciclo_min_dias?: number | null; ciclo_max_dias?: number | null
  populacao_ha?: number | null; populacao_min_ha?: number | null; populacao_max_ha?: number | null; produtividade_ha?: number | null; unidade?: string; fonte?: string; url?: string; data?: string }
type Base = { gerado_em: string; insumos: RefInsumo[]; culturas: Record<string, RefCultura>; precos_produto?: Record<string, { preco?: number | null; fonte?: string; url?: string; data?: string }> }

export const MERCADO = base as Base
export const INSUMOS_MERCADO = MERCADO.insumos

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Procura o produto na base de mercado pelo nome comercial (ignora acento, caixa e pontuação). */
export function referenciaInsumo(nome?: string | null): RefInsumo | undefined {
  if (!nome) return undefined
  const n = normal(nome)
  if (n.length < 3) return undefined
  return INSUMOS_MERCADO.find((r) => normal(r.nome) === n)
    ?? INSUMOS_MERCADO.find((r) => n.startsWith(normal(r.nome)) || normal(r.nome).startsWith(n))
}

/** Referência da cultura; milho e sorgo na safrinha usam a referência de safrinha quando existe. */
export function referenciaCultura(cultura: string, safra?: string | null): RefCultura | undefined {
  const c = MERCADO.culturas
  const r = cultura === 'Milho' ? (safra?.startsWith('Safrinha') ? c['Milho safrinha'] : c['Milho']) ?? c['Milho safrinha'] ?? c['Milho'] : c[cultura]
  if (!r) return undefined
  // As fontes dão faixas (a cultivar define o valor): o padrão usado é o meio da faixa.
  const meio = (a?: number | null, b?: number | null, arred = 1) => (a != null && b != null ? Math.round((a + b) / 2 / arred) * arred : null)
  return { ...r, ciclo_dias: r.ciclo_dias ?? meio(r.ciclo_min_dias, r.ciclo_max_dias), populacao_ha: r.populacao_ha ?? meio(r.populacao_min_ha, r.populacao_max_ha, 1000) }
}

/** Preço de venda de referência da cultura (R$/sc ou R$/kg ATR). */
export function precoProduto(cultura: string) {
  const p = MERCADO.precos_produto ?? {}
  return cultura === 'Cana-de-açúcar' ? p['Cana (ATR)'] : p[cultura]
}

/** Texto curto da dose de bula: "2–3 L/ha". */
export function doseMercado(r?: RefInsumo): string | null {
  if (!r || (r.dose_min_ha == null && r.dose_max_ha == null)) return null
  const f = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  const faixa = r.dose_min_ha != null && r.dose_max_ha != null && r.dose_min_ha !== r.dose_max_ha
    ? `${f(r.dose_min_ha)}–${f(r.dose_max_ha)}` : f((r.dose_min_ha ?? r.dose_max_ha)!)
  return `${faixa} ${r.unidade}/ha`
}

/** Preço de referência com fonte e mês: "R$ 32,50/L · Agrolink 2026-09". */
export function precoMercado(r?: RefInsumo): string | null {
  if (!r?.preco) return null
  return `R$ ${r.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${r.unidade}${r.preco_fonte ? ` · ${r.preco_fonte}${r.preco_data ? ' ' + r.preco_data : ''}` : ''}`
}
