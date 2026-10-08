import type { Ciclo, Estadio, Operacao, Talhao } from './tipos'
import { corDosProblemas, gravidade, nomeProblema, ordenar, classeQueTrata, type Problema } from './problemas'
import { precoProduto, referenciaCultura } from './mercado'

export const TIPOS_COLHEITA = ['Colheita', 'Corte de cana']
/** Colhido quando a área das colheitas chega a 95% do talhão (mesma regra do banco). */
export const FRACAO_COLHIDO = 0.95

const iso = (d: Date) => d.toISOString().slice(0, 10)
/** Data local (Brasil) de um horário gravado. */
export const diaLocal = (dataHora: string) => iso(new Date(new Date(dataHora).getTime() - 3 * 3600e3))

/** Nome da safra pela cultura e data: Soja 2026/27, Safrinha 2027, Cana 2026/27 (igual ao banco). */
export function nomeSafra(cultura: string, dia: string): string {
  const [a, m] = dia.split('-').map(Number)
  const par = (ini: number) => `${ini}/${String(ini + 1).slice(2)}`
  if (cultura === 'Cana-de-açúcar') return `Cana ${par(m >= 4 ? a : a - 1)}`
  if ((cultura === 'Milho' || cultura === 'Sorgo') && m <= 6) return `Safrinha ${a}`
  return `${cultura === 'Soja' ? 'Soja' : 'Safra'} ${par(m >= 7 ? a : a - 1)}`
}

/** A safra como conjunto: Soja AAAA/AA, Safrinha AAAA (milho e sorgo juntos) e Cana AAAA/AA, separadas. */
export function grupoSafra(c: Pick<Ciclo, 'safra' | 'cultura'>): string {
  if (c.cultura === 'Soja' && c.safra.startsWith('Safra ')) return 'Soja ' + c.safra.slice(6)
  return c.safra
}

/** Safras do conjunto, as em andamento primeiro e depois as mais novas. */
export function listaSafras(ciclos: Ciclo[]): { nome: string; ativa: boolean }[] {
  const m = new Map<string, boolean>()
  for (const c of ciclos) if (!c.excluido_em) m.set(grupoSafra(c), (m.get(grupoSafra(c)) ?? false) || c.status !== 'Colhido')
  return [...m].map(([nome, ativa]) => ({ nome, ativa }))
    .sort((a, b) => Number(b.ativa) - Number(a.ativa) || tipoSafra(a.nome) - tipoSafra(b.nome) || anoSafra(b.nome) - anoSafra(a.nome))
}
/** Grãos primeiro (Soja, depois Safrinha); Cana por último. */
const tipoSafra = (n: string) => (n.startsWith('Soja') ? 0 : n.startsWith('Safrinha') ? 1 : n.startsWith('Cana') ? 3 : 2)
const anoSafra = (n: string) => Number(n.match(/\d{4}/)?.[0] ?? 0)

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

/** Estádio que vale para a tela: o confirmado no campo (ou anotado pelo gestor) há até 15 dias; senão o estimado. */
export function estadioDaSafra(c: CicloVivo, dap: number | null, confirmados: Estadio[], hoje = new Date()) {
  const ult = confirmados.filter((x) => x.ciclo_id === c.id && !x.excluido_em).sort((a, b) => b.data_hora.localeCompare(a.data_hora))[0]
  const doGestor = c.estadio_atual && c.data_estadio ? { estadio: c.estadio_atual, data: c.data_estadio } : null
  const campo = ult ? { estadio: ult.estadio, data: ult.data_hora.slice(0, 10), autor: ult.autor_id } : null
  const conf = campo && (!doGestor || campo.data >= doGestor.data) ? campo : doGestor
  const idade = conf ? Math.floor((hoje.getTime() - new Date(conf.data + 'T12:00:00').getTime()) / 864e5) : null
  const estimado = c.status === 'Em andamento' ? estadioEstimado(c, dap) : null
  return {
    estimado,
    confirmado: conf ? { ...conf, dias: idade! } : null,
    /** O que a tela usa: confirmado recente; senão o estimado; senão o último confirmado. */
    vale: conf && (idade! <= 15 || !estimado) ? conf.estadio : estimado,
    valeConfirmado: !!conf && (idade! <= 15 || !estimado),
  }
}

// ── Estado da safra ───────────────────────────────────────────────────────
export type Nivel = 'bom' | 'atencao' | 'critico' | 'info'
export type Ponto = { nivel: Nivel; texto: string }
export type Diagnostico = {
  nivel: 'bom' | 'atencao' | 'critico' | 'sem-dados'
  titulo: string
  estadio: string | null
  estadioEstimado: boolean
  /** O ponto de atenção agora (o que já está em tratamento não entra). */
  agora: string | null
  pontos: Ponto[]
}

export type EntradaDiagnostico = {
  ciclo?: CicloVivo
  areaHa: number
  dap: number | null
  diasParaColheita: number | null
  problemas: Problema[]           // do talhão, desta safra
  estadio: { vale: string | null; valeConfirmado: boolean }
  chuva15: number
  chuva30: number
  chuva7: number
  produtividade: number | null
  custoHa: number | null
  custoEstimado: boolean
}

/** Conclui o estado da safra no talhão a partir dos problemas, estádio, chuva e colheita. */
export function diagnosticoSafra(e: EntradaDiagnostico): Diagnostico {
  const c = e.ciclo
  if (!c) return { nivel: 'sem-dados', titulo: 'Sem safra', estadio: null, estadioEstimado: false, agora: null, pontos: [{ nivel: 'info', texto: 'Registre o Plantio (Registrar › Operação) e a safra se monta sozinha.' }] }
  const pontos: Ponto[] = []

  if (c.status === 'Planejado') {
    pontos.push({ nivel: 'info', texto: `Aguardando plantio. Quando a operação Plantio for registrada, a safra passa para "em andamento".` })
    return { nivel: 'bom', titulo: 'Planejada', estadio: 'Pré-plantio', estadioEstimado: false, agora: null, pontos }
  }
  const estadio = c.status === 'Colhido' ? 'Colhido' : e.estadio.vale

  if (c.status === 'Colhido') {
    const ref = referenciaCultura(c.cultura, c.safra)
    const alvo = c.meta_por_ha ?? ref?.produtividade_ha ?? null
    if (e.produtividade != null && alvo) {
      const r = e.produtividade / alvo
      const base = c.meta_por_ha ? 'da meta' : 'da média regional (padrão mercado)'
      pontos.push({ nivel: r >= 0.95 ? 'bom' : r >= 0.8 ? 'atencao' : 'critico', texto: `Produtividade ${fmt(e.produtividade)} ${c.unidade_producao}/ha, ${Math.round(r * 100)}% ${base}.` })
    } else if (e.produtividade == null) pontos.push({ nivel: 'info', texto: 'Colhida. Informe a produção na operação de colheita para fechar o resultado.' })
    if (e.custoHa != null) pontos.push({ nivel: 'info', texto: `Insumos: R$ ${fmt(e.custoHa)}/ha${e.custoEstimado ? ' (parte estimada)' : ''}.` })
    const venda = precoProduto(c.cultura)
    if (e.produtividade != null && venda?.preco && c.cultura !== 'Cana-de-açúcar' && c.unidade_producao === 'sc') {
      const receita = e.produtividade * venda.preco
      pontos.push({ nivel: 'info', texto: `Receita bruta ≈ R$ ${fmt(receita)}/ha (padrão mercado: R$ ${venda.preco.toLocaleString('pt-BR')}/sc, ${venda.fonte ?? ''})${e.custoHa != null ? `, sobra ≈ R$ ${fmt(receita - e.custoHa)}/ha depois dos insumos` : ''}.` })
    }
    return { nivel: pior(pontos), titulo: 'Colhida', estadio, estadioEstimado: false, agora: null, pontos }
  }

  // Problemas: a cor vem dos abertos; o que está em tratamento aparece à parte.
  const abertos = ordenar(e.problemas.filter((p) => p.situacao === 'aberto'))
  const nivelGrav = { Alta: 'critico', Média: 'atencao', Leve: 'info' } as const
  for (const p of abertos) {
    const quem = p.c.quem_viu && p.c.quem_viu !== 'Equipe' ? `, visto pelo ${p.c.quem_viu.toLowerCase()}` : ''
    const trata = classeQueTrata(p.c.tipo)
    pontos.push({ nivel: nivelGrav[gravidade(p.c)], texto: `${cap(nomeProblema(p.c))} (${gravidade(p.c).toLowerCase()}) ${quando(diasAte(p.c.data_hora))}${quem}${trata ? `, sem ${trata} aplicado depois` : ''}.` })
  }
  for (const p of e.problemas.filter((x) => x.situacao === 'em-tratamento'))
    pontos.push({ nivel: 'info', texto: `${cap(nomeProblema(p.c))} em tratamento com ${p.produto} ${quando(p.diasTratado ?? 0).replace('desde', 'aplicado')}.` })
  for (const p of e.problemas.filter((x) => x.situacao === 'perguntar'))
    pontos.push({ nivel: 'atencao', texto: `${cap(nomeProblema(p.c))}: tratado com ${p.produto} há ${p.diasTratado} dias. Resolveu?` })

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

  const faltam = [!c.cultivar && 'cultivar', !c.ciclo_cultivar_dias && 'ciclo da cultivar'].filter(Boolean)
  if (faltam.length) pontos.push({ nivel: 'info', texto: `Para estimar melhor o estádio, informe ${faltam.join(' e ')} no Plantio ou na safra.` })
  if (e.custoHa != null) pontos.push({ nivel: 'info', texto: `Insumos até agora: R$ ${fmt(e.custoHa)}/ha${e.custoEstimado ? ' (parte estimada)' : ''}.` })

  // Cor: problemas abertos e gravidade; os demais avisos só pedem atenção.
  const cor = corDosProblemas(e.problemas)
  const nivel = cor === 'critico' ? 'critico' : cor === 'atencao' || pontos.some((p) => p.nivel === 'atencao') ? 'atencao' : 'bom'
  const ordenados = pontos.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel])
  const agora = abertos[0] ? ordenados[0].texto : ordenados.find((p) => p.nivel === 'atencao' || p.nivel === 'critico')?.texto ?? null
  return {
    nivel, estadio, estadioEstimado: !e.estadio.valeConfirmado, agora,
    titulo: nivel === 'critico' ? 'Crítico' : nivel === 'atencao' ? 'Atenção' : 'Em dia',
    pontos: ordenados,
  }
}

const ORDEM: Record<Nivel, number> = { critico: 0, atencao: 1, bom: 2, info: 3 }
function pior(p: Ponto[]): 'bom' | 'atencao' | 'critico' {
  if (p.some((x) => x.nivel === 'critico')) return 'critico'
  if (p.some((x) => x.nivel === 'atencao')) return 'atencao'
  return 'bom'
}
const diasAte = (x: string) => Math.floor((Date.now() - new Date(x).getTime()) / 864e5)
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 })
const quando = (d: number | null) => (!d ? 'desde hoje' : d === 1 ? 'desde ontem' : `há ${d} dias`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
