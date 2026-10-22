import type { Ciclo, Operacao } from './tipos'
import { cicloAberto, diaLocal, grupoSafra, TIPOS_COLHEITA } from './safra'

/** Aberta há mais que isso, o app lembra de fechar. */
export const DIAS_LEMBRAR_FECHAR = 7

const DIA = 864e5
const dataLocal = (iso: string) => new Date(diaLocal(iso) + 'T12:00:00').getTime()

/** Dias corridos da operação, contando o primeiro e o último (seg a qui = 4). Aberta: até hoje. */
export function duracaoDias(o: Pick<Operacao, 'data_hora' | 'data_fim' | 'em_andamento'>, hoje = new Date()): number {
  const fim = o.em_andamento ? hoje.toISOString() : o.data_fim ?? o.data_hora
  return Math.max(1, Math.round((dataLocal(fim) - dataLocal(o.data_hora)) / DIA) + 1)
}

/** Dias desde que começou (0 = hoje). */
export const diasAberta = (o: Pick<Operacao, 'data_hora'>, hoje = new Date()) =>
  Math.max(0, Math.round((dataLocal(hoje.toISOString()) - dataLocal(o.data_hora)) / DIA))

export type LoteAberto = { chave: string; tipo: string; inicio: string; ops: Operacao[]; dias: number; lembrar: boolean }

/** Operações em andamento, juntando as que foram abertas juntas (mesmo lote), da mais antiga para a mais nova. */
export function lotesAbertos(ops: Operacao[], hoje = new Date()): LoteAberto[] {
  const m = new Map<string, Operacao[]>()
  for (const o of ops) {
    if (!o.em_andamento || o.excluido_em) continue
    const k = o.lote_id ?? o.id
    m.set(k, [...(m.get(k) ?? []), o])
  }
  return [...m].map(([chave, l]) => {
    const inicio = l.map((o) => o.data_hora).sort()[0]
    const dias = diasAberta({ data_hora: inicio }, hoje)
    return { chave, tipo: l[0].tipo, inicio, ops: l, dias, lembrar: dias > DIAS_LEMBRAR_FECHAR }
  }).sort((a, b) => a.inicio.localeCompare(b.inicio))
}

// ── Mapa da operação ─────────────────────────────────────────────────────
export type SituacaoMapa = 'feito' | 'andamento' | 'falta' | 'fora'

/**
 * Situação de cada talhão para um tipo de operação, na safra dos talhões escolhidos:
 * feito (já recebeu e terminou), andamento (aberta), falta (é da safra e ainda não recebeu) e fora.
 * Plantio: talhão sem safra aberta conta como "falta" (é onde o plantio ainda vai entrar).
 */
export function situacaoNoMapa(
  talhoes: { id: string }[], ops: Operacao[], ciclos: Ciclo[], tipo: string, escolhidos: string[],
): Map<string, SituacaoMapa> {
  const res = new Map<string, SituacaoMapa>()
  const abertoDe = new Map(talhoes.map((t) => [t.id, cicloAberto(t.id, ciclos)]))
  // Safras em jogo: a dos talhões escolhidos; sem escolha, todas as abertas.
  const grupos = new Set(escolhidos.map((id) => abertoDe.get(id)).filter((c): c is Ciclo => !!c).map(grupoSafra))
  const vale = (c: Ciclo) => !grupos.size || grupos.has(grupoSafra(c))
  const doTipo = (o: Operacao) => o.tipo === tipo || (TIPOS_COLHEITA.includes(tipo) && TIPOS_COLHEITA.includes(o.tipo))
  for (const t of talhoes) {
    const c = abertoDe.get(t.id)
    if (!c) { res.set(t.id, tipo === 'Plantio' ? 'falta' : 'fora'); continue }
    if (!vale(c)) { res.set(t.id, 'fora'); continue }
    const feitas = ops.filter((o) => o.talhao_id === t.id && o.ciclo_id === c.id && !o.excluido_em && doTipo(o))
    res.set(t.id, feitas.some((o) => o.em_andamento) ? 'andamento' : feitas.length ? 'feito' : 'falta')
  }
  return res
}

// ── Ficha do talhão por safra ────────────────────────────────────────────
export type Etapa = { inicio: string; fim: string; dias: number; aberta: boolean }
export type FichaSafra = {
  ciclo: Ciclo
  plantio: Etapa | null
  colheita: Etapa | null
  /** Do primeiro dia de plantio ao último de colheita (ou até hoje, se não colheu). */
  diasCiclo: number | null
  cicloCompleto: boolean
  sobras: string[]
}

/** Junta as operações de uma etapa (vários lançamentos de plantio, por exemplo) num período só. */
function etapa(ops: Operacao[], hoje: Date): Etapa | null {
  if (!ops.length) return null
  const inicio = ops.map((o) => o.data_hora).sort()[0]
  const aberta = ops.some((o) => o.em_andamento)
  const fim = aberta ? hoje.toISOString() : ops.map((o) => o.data_fim ?? o.data_hora).sort().at(-1)!
  return { inicio, fim, aberta, dias: duracaoDias({ data_hora: inicio, data_fim: fim, em_andamento: false }) }
}

export function fichaSafra(c: Ciclo, ops: Operacao[], hoje = new Date()): FichaSafra {
  const doCiclo = ops.filter((o) => o.ciclo_id === c.id && !o.excluido_em)
  const plantio = etapa(doCiclo.filter((o) => o.tipo === 'Plantio'), hoje)
  const colheita = etapa(doCiclo.filter((o) => TIPOS_COLHEITA.includes(o.tipo)), hoje)
  const ini = plantio?.inicio ?? (c.data_plantio ? c.data_plantio + 'T12:00:00Z' : null)
  const completo = !!colheita && !colheita.aberta && c.status === 'Colhido'
  const fim = completo ? colheita!.fim : c.status === 'Colhido' && c.data_colheita ? c.data_colheita + 'T12:00:00Z' : hoje.toISOString()
  const sobras = doCiclo.flatMap((o) => o.sobras ?? []).map((s) =>
    s.cultivar + [s.sementes, s.area_ha != null ? `≈${String(s.area_ha).replace('.', ',')} ha` : null].filter(Boolean).map((x) => ` · ${x}`).join(''))
  return {
    ciclo: c, plantio, colheita, sobras,
    diasCiclo: ini ? duracaoDias({ data_hora: ini, data_fim: fim, em_andamento: false }) : null,
    cicloCompleto: completo || c.status === 'Colhido',
  }
}

// ── Operações da safra e aplicações ──────────────────────────────────────
/** Antes do plantio, operações sem safra até este tanto de dias entram na safra (dessecação, adubação de base). */
export const DIAS_PRE_PLANTIO = 90

/**
 * Operações que pertencem à safra: as ligadas a ela e as feitas no talhão antes do plantio sem safra
 * aberta (dessecação, adubação de base), desde a colheita da safra anterior e no máximo 90 dias antes.
 */
export function operacoesDaSafra(c: Ciclo, ops: Operacao[], ciclos: Ciclo[]): Operacao[] {
  const plantio = c.data_plantio
  let inicio = ''
  if (plantio) {
    inicio = new Date(new Date(plantio + 'T12:00:00Z').getTime() - DIAS_PRE_PLANTIO * DIA).toISOString().slice(0, 10)
    for (const x of ciclos) {
      if (x.id === c.id || x.talhao_id !== c.talhao_id || x.excluido_em || !x.data_colheita) continue
      if (x.data_colheita <= plantio && x.data_colheita > inicio) inicio = x.data_colheita
    }
  }
  return ops.filter((o) => !o.excluido_em && (o.ciclo_id === c.id ||
    (!o.ciclo_id && !!plantio && o.talhao_id === c.talhao_id && diaLocal(o.data_hora) > inicio && diaLocal(o.data_hora) <= plantio)))
}

export const TIPOS_APLICACAO = ['Pulverização']
/** Mesma faixa da janela de pulverização do Início. */
export const FAIXA_APLICACAO = { ventoMax: 10, umidadeMin: 55, tempMax: 30 }

export type Condicao = { nivel: 'bom' | 'atencao' | 'sem-dados'; fora: string[] }

/** Condição da aplicação frente à faixa recomendada: o que ficou fora, ou sem dado anotado. */
export function condicaoAplicacao(o: Pick<Operacao, 'temperatura_c' | 'umidade_pct' | 'vento_kmh'>): Condicao {
  const t = o.temperatura_c == null ? null : Number(o.temperatura_c)
  const u = o.umidade_pct == null ? null : Number(o.umidade_pct)
  const v = o.vento_kmh == null ? null : Number(o.vento_kmh)
  if (t == null && u == null && v == null) return { nivel: 'sem-dados', fora: [] }
  const fora: string[] = []
  if (v != null && v > FAIXA_APLICACAO.ventoMax) fora.push(`vento acima de ${FAIXA_APLICACAO.ventoMax} km/h`)
  if (u != null && u < FAIXA_APLICACAO.umidadeMin) fora.push(`umidade abaixo de ${FAIXA_APLICACAO.umidadeMin}%`)
  if (t != null && t > FAIXA_APLICACAO.tempMax) fora.push(`temperatura acima de ${FAIXA_APLICACAO.tempMax} °C`)
  return { nivel: fora.length ? 'atencao' : 'bom', fora }
}
