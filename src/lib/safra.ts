import type { Campo, Ciclo, Operacao, Talhao } from './tipos'
import { precoProduto, referenciaCultura } from './mercado'

export const TIPOS_COLHEITA = ['Colheita', 'Corte de cana']
/** Colhido quando a área das colheitas chega a 95% do talhão (mesma regra do banco). */
export const FRACAO_COLHIDO = 0.95

const iso = (d: Date) => d.toISOString().slice(0, 10)
/** Data local (Brasil) de um horário gravado. */
export const diaLocal = (dataHora: string) => iso(new Date(new Date(dataHora).getTime() - 3 * 3600e3))

/** Nome da safra pela cultura e data: Safra 2026/27, Safrinha 2027, Cana 2026/27 (igual ao banco). */
export function nomeSafra(cultura: string, dia: string): string {
  const [a, m] = dia.split('-').map(Number)
  const par = (ini: number) => `${ini}/${String(ini + 1).slice(2)}`
  if (cultura === 'Cana-de-açúcar') return `Cana ${par(m >= 4 ? a : a - 1)}`
  if ((cultura === 'Milho' || cultura === 'Sorgo') && m <= 6) return `Safrinha ${a}`
  return `Safra ${par(m >= 7 ? a : a - 1)}`
}

/** Safra que recebe as operações do talhão agora: em andamento; senão a planejada. */
export function cicloAberto(talhaoId: string, ciclos: Ciclo[]): Ciclo | undefined {
  return ciclos.filter((c) => c.talhao_id === talhaoId && c.status !== 'Colhido' && !c.excluido_em)
    .sort((a, b) => Number(b.status === 'Em andamento') - Number(a.status === 'Em andamento') ||
      (b.data_plantio ?? '').localeCompare(a.data_plantio ?? ''))[0]
}

export type CicloVivo = Ciclo & { areaColhida: number; fracaoColhida: number; producaoDasOperacoes: boolean }

/** A safra como resultado das operações: plantio, cultivar, produção e colheita saem dos registros. */
export function derivarCiclo(c: Ciclo, ops: Operacao[], areaTalhao: number): CicloVivo {
  const doCiclo = ops.filter((o) => o.ciclo_id === c.id && !o.excluido_em).sort((a, b) => a.data_hora.localeCompare(b.data_hora))
  const plantios = doCiclo.filter((o) => o.tipo === 'Plantio')
  const colheitas = doCiclo.filter((o) => TIPOS_COLHEITA.includes(o.tipo))
  const areaColhida = colheitas.reduce((s, o) => s + Number(o.area_ha ?? 0), 0)
  const comProducao = colheitas.filter((o) => o.producao != null)
  const producao = comProducao.length ? comProducao.reduce((s, o) => s + Number(o.producao), 0) : c.producao ?? null
  const colhido = areaTalhao > 0 && areaColhida >= FRACAO_COLHIDO * areaTalhao
  const plantio = plantios[0] ? diaLocal(plantios[0].data_hora) : null
  return {
    ...c,
    data_plantio: plantio ?? c.data_plantio,
    cultivar: c.cultivar ?? plantios.find((o) => o.cultivar)?.cultivar ?? null,
    populacao_plantas_ha: c.populacao_plantas_ha ?? plantios.find((o) => o.populacao_plantas_ha)?.populacao_plantas_ha ?? null,
    producao,
    unidade_producao: comProducao.length
      ? (comProducao.find((o) => o.unidade_producao)?.unidade_producao ?? c.unidade_producao ?? (c.cultura === 'Cana-de-açúcar' ? 't' : 'sc'))
      : c.unidade_producao,
    data_colheita: colhido ? diaLocal(colheitas[colheitas.length - 1].data_hora) : c.data_colheita,
    status: colhido ? 'Colhido' : c.status === 'Planejado' && plantio ? 'Em andamento' : c.status,
    areaColhida,
    fracaoColhida: areaTalhao > 0 ? Math.min(1, areaColhida / areaTalhao) : 0,
    producaoDasOperacoes: comProducao.length > 0,
  }
}

export function derivarCiclos(ciclos: Ciclo[], ops: Operacao[], talhoes: Pick<Talhao, 'id' | 'area_ha'>[]): CicloVivo[] {
  const area = new Map(talhoes.map((t) => [t.id, Number(t.area_ha)]))
  return ciclos.map((c) => derivarCiclo(c, ops, area.get(c.talhao_id) ?? 0))
}

// ── Estádio estimado pelos dias após o plantio ────────────────────────────
// Frações do ciclo da cultivar em que cada fase começa (do plantio à emergência conta como VE) (aproximação para acompanhar a lavoura;
// o estádio anotado no campo, quando recente, sempre vale mais).
const FASES_GRAOS: Record<string, [number, string][]> = {
  Soja: [[0, 'Emergência (VE)'], [0.1, 'Vegetativo (V)'], [0.38, 'Pré-florescimento'], [0.45, 'Florescimento (R1-R2)'], [0.56, 'Formação de grãos (R3-R5)'], [0.82, 'Maturação (R6-R8)'], [1, 'Pronto para colheita']],
  Milho: [[0, 'Emergência (VE)'], [0.1, 'Vegetativo (V)'], [0.42, 'Pré-florescimento'], [0.5, 'Florescimento (R1-R2)'], [0.58, 'Formação de grãos (R3-R5)'], [0.88, 'Maturação (R6-R8)'], [1, 'Pronto para colheita']],
  Sorgo: [[0, 'Emergência (VE)'], [0.1, 'Vegetativo (V)'], [0.42, 'Pré-florescimento'], [0.52, 'Florescimento (R1-R2)'], [0.6, 'Formação de grãos (R3-R5)'], [0.88, 'Maturação (R6-R8)'], [1, 'Pronto para colheita']],
}
const FASES_CANA: [number, string][] = [[0, 'Cana: Brotação'], [60, 'Cana: Perfilhamento'], [150, 'Cana: Crescimento'], [270, 'Cana: Maturação']]

/** Dias do ciclo: o da cultivar; senão o padrão de mercado da cultura. */
export function diasDoCiclo(c: Pick<Ciclo, 'cultura' | 'ciclo_cultivar_dias' | 'safra'>): { dias: number | null; padrao: boolean } {
  if (c.ciclo_cultivar_dias) return { dias: c.ciclo_cultivar_dias, padrao: false }
  const r = referenciaCultura(c.cultura, c.safra)
  return { dias: r?.ciclo_dias ?? null, padrao: r?.ciclo_dias != null }
}

export function estadioEstimado(c: Pick<Ciclo, 'cultura' | 'ciclo_cultivar_dias' | 'safra'>, dap: number | null): string | null {
  if (dap == null || dap < 0) return null
  if (c.cultura === 'Cana-de-açúcar') return [...FASES_CANA].reverse().find(([d]) => dap >= d)![1]
  const fases = FASES_GRAOS[c.cultura]
  const { dias } = diasDoCiclo(c)
  if (!fases || !dias) return null
  const f = dap / dias
  return [...fases].reverse().find(([x]) => f >= x)![1]
}

const FASES_CRITICAS_AGUA = ['Florescimento (R1-R2)', 'Formação de grãos (R3-R5)']

// ── Estado da safra ───────────────────────────────────────────────────────
export type Nivel = 'bom' | 'atencao' | 'critico' | 'info'
export type Ponto = { nivel: Nivel; texto: string }
export type Diagnostico = {
  nivel: 'bom' | 'atencao' | 'critico' | 'sem-dados'
  titulo: string
  estadio: string | null
  estadioEstimado: boolean
  pontos: Ponto[]
}

export type EntradaDiagnostico = {
  ciclo?: CicloVivo
  areaHa: number
  dap: number | null
  diasParaColheita: number | null
  operacoes: Operacao[]          // do talhão, mais recentes primeiro
  campo: Campo[]                 // do talhão
  chuva15: number
  chuva30: number
  chuva7: number
  produtividade: number | null
  custoHa: number | null
  custoEstimado: boolean
}

/** Conclui o estado da safra a partir do que foi registrado (operações, MIP, chuva, estádio, colheita). */
export function diagnosticoSafra(e: EntradaDiagnostico, hoje = new Date()): Diagnostico {
  const c = e.ciclo
  if (!c) return { nivel: 'sem-dados', titulo: 'Sem safra', estadio: null, estadioEstimado: false, pontos: [{ nivel: 'info', texto: 'Registre o Plantio (Registrar › Operação) e a safra se monta sozinha.' }] }
  const pontos: Ponto[] = []
  const desde = (x?: string | null) => (x ? Math.floor((hoje.getTime() - new Date(x.length === 10 ? x + 'T12:00:00' : x).getTime()) / 864e5) : null)

  if (c.status === 'Planejado') {
    pontos.push({ nivel: 'info', texto: `Aguardando plantio. Quando a operação Plantio for registrada, a safra passa para "em andamento".` })
    return { nivel: 'bom', titulo: 'Planejada', estadio: 'Pré-plantio', estadioEstimado: false, pontos }
  }

  // Estádio: o anotado vale se for recente; senão o estimado pelos dias de plantio.
  const anotadoHa = desde(c.data_estadio)
  const estimado = c.status === 'Em andamento' ? estadioEstimado(c, e.dap) : null
  const usaAnotado = !!c.estadio_atual && (anotadoHa == null || anotadoHa <= 15 || !estimado)
  const estadio = c.status === 'Colhido' ? 'Colhido' : usaAnotado ? c.estadio_atual! : estimado

  if (c.status === 'Colhido') {
    const ref = referenciaCultura(c.cultura, c.safra)
    const alvo = c.meta_por_ha ?? ref?.produtividade_ha ?? null
    if (e.produtividade != null && alvo) {
      const r = e.produtividade / alvo
      const base = c.meta_por_ha ? 'da meta' : 'da média regional (padrão mercado)'
      pontos.push({ nivel: r >= 0.95 ? 'bom' : r >= 0.8 ? 'atencao' : 'critico', texto: `Produtividade ${fmt(e.produtividade)} ${c.unidade_producao}/ha, ${Math.round(r * 100)}% ${base}.` })
    } else if (e.produtividade == null) pontos.push({ nivel: 'info', texto: 'Colhida. Informe a produção na operação de colheita para fechar o resultado.' })
    if (e.custoHa != null) pontos.push({ nivel: 'info', texto: `Insumos: R$ ${fmt(e.custoHa)}/ha${e.custoEstimado ? ' (parte pelo padrão mercado)' : ''}.` })
    const venda = precoProduto(c.cultura)
    if (e.produtividade != null && venda?.preco && c.cultura !== 'Cana-de-açúcar' && c.unidade_producao === 'sc') {
      const receita = e.produtividade * venda.preco
      pontos.push({ nivel: 'info', texto: `Receita bruta ≈ R$ ${fmt(receita)}/ha (padrão mercado: R$ ${venda.preco.toLocaleString('pt-BR')}/sc, ${venda.fonte ?? ''})${e.custoHa != null ? `, sobra ≈ R$ ${fmt(receita - e.custoHa)}/ha depois dos insumos` : ''}.` })
    }
    return { nivel: pior(pontos), titulo: 'Colhida', estadio, estadioEstimado: false, pontos }
  }

  // MIP: nível de controle atingido e se já houve pulverização depois.
  const abertos = e.campo.filter((x) => x.status !== 'Resolvida' && !x.excluido_em)
  for (const a of abertos.filter((x) => x.status === 'Aplicação indicada')) {
    const pulv = e.operacoes.find((o) => o.tipo === 'Pulverização' && o.data_hora > a.data_hora)
    const nome = `${a.tipo.toLowerCase()}${a.alvo ? ` (${a.alvo})` : ''}`
    if (pulv) pontos.push({ nivel: 'atencao', texto: `Pulverização feita depois do alerta de ${nome}. Volte a monitorar e marque como resolvida se o nível caiu.` })
    else pontos.push({ nivel: 'critico', texto: `${cap(nome)} acima do nível de controle ${quando(desde(a.data_hora))}, sem pulverização registrada depois.` })
  }
  for (const a of abertos.filter((x) => x.status !== 'Aplicação indicada' && x.urgencia === 'Alta'))
    pontos.push({ nivel: 'atencao', texto: `${a.tipo}${a.alvo ? ` (${a.alvo})` : ''} com urgência alta em aberto.` })

  // Frequência de monitoramento com a lavoura no campo.
  const ultMon = e.campo.filter((x) => !x.excluido_em).sort((a, b) => b.data_hora.localeCompare(a.data_hora))[0]
  const semMon = ultMon ? desde(ultMon.data_hora) : e.dap
  if (c.cultura !== 'Cana-de-açúcar' && e.dap != null && e.dap >= 10 && semMon != null && semMon > 10)
    pontos.push({ nivel: 'atencao', texto: `${ultMon ? `Último monitoramento há ${semMon} dias` : 'Nenhum monitoramento desde o plantio'}. O MIP pede vistoria semanal.` })

  // Água nas fases críticas (florescimento e enchimento de grãos).
  if (estadio && FASES_CRITICAS_AGUA.includes(estadio) && e.chuva15 < 30)
    pontos.push({ nivel: 'atencao', texto: `Só ${fmt(e.chuva15)} mm de chuva em 15 dias em ${estadio.toLowerCase()}, fase de maior consumo de água (cerca de 7 mm/dia).` })
  if (estadio && ['Maturação (R6-R8)', 'Pronto para colheita'].includes(estadio) && e.chuva7 > 80)
    pontos.push({ nivel: 'atencao', texto: `${fmt(e.chuva7)} mm em 7 dias na maturação: risco de grão ardido e atraso na colheita.` })

  // Colheita.
  if (c.fracaoColhida > 0) pontos.push({ nivel: 'info', texto: `Colheita em andamento: ${Math.round(c.fracaoColhida * 100)}% da área (${fmt(c.areaColhida)} de ${fmt(e.areaHa)} ha).` })
  if (e.diasParaColheita != null && e.diasParaColheita < -7 && c.fracaoColhida < FRACAO_COLHIDO)
    pontos.push({ nivel: 'atencao', texto: `Colheita prevista há ${-e.diasParaColheita} dias e ainda não registrada.` })
  else if (e.diasParaColheita != null && e.diasParaColheita >= 0 && e.diasParaColheita <= 15)
    pontos.push({ nivel: 'info', texto: `Colheita prevista em ${e.diasParaColheita} dias. Hora de programar máquinas e frete.` })

  // Dados que melhoram a conclusão.
  const faltam = [!c.cultivar && 'cultivar', !c.ciclo_cultivar_dias && 'ciclo da cultivar', c.cultura !== 'Cana-de-açúcar' && !c.populacao_plantas_ha && 'população'].filter(Boolean)
  if (faltam.length) pontos.push({ nivel: 'info', texto: `Para estimar melhor, informe ${faltam.join(', ')} no Plantio ou na safra.` })
  if (e.custoHa != null) pontos.push({ nivel: 'info', texto: `Insumos até agora: R$ ${fmt(e.custoHa)}/ha${e.custoEstimado ? ' (parte pelo padrão mercado)' : ''}.` })

  const nivel = pior(pontos)
  return {
    nivel, estadio, estadioEstimado: !usaAnotado && !!estimado,
    titulo: nivel === 'critico' ? 'Ação necessária' : nivel === 'atencao' ? 'Pede atenção' : 'Safra em dia',
    pontos: pontos.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]),
  }
}

const ORDEM: Record<Nivel, number> = { critico: 0, atencao: 1, bom: 2, info: 3 }
function pior(p: Ponto[]): 'bom' | 'atencao' | 'critico' {
  if (p.some((x) => x.nivel === 'critico')) return 'critico'
  if (p.some((x) => x.nivel === 'atencao')) return 'atencao'
  return 'bom'
}
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 })
const quando = (d: number | null) => (!d ? 'desde hoje' : d === 1 ? 'desde ontem' : `há ${d} dias`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
