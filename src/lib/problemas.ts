import type { Campo, Insumo, Operacao, OperacaoProduto } from './tipos'
import { referenciaInsumo } from './mercado'

/** Tipos do registro rápido de problema (o banco aceita outros tipos antigos também). */
export const TIPOS_PROBLEMA = ['Praga', 'Planta daninha', 'Doença', 'Falha de estande', 'Outro'] as const
export const GRAVIDADES = ['Leve', 'Média', 'Alta'] as const
export const QUEM_VIU = ['Equipe', 'Vendedor', 'Agrônomo'] as const
export const CLASSES_INSUMO = ['Herbicida', 'Inseticida', 'Fungicida', 'Acaricida', 'Nematicida', 'Tratamento de sementes', 'Adjuvante', 'Adubo', 'Corretivo', 'Semente', 'Combustível', 'Outro'] as const

/** Depois de quantos dias do tratamento o app pergunta "resolveu?" (calibrar com o uso). */
export const DIAS_PERGUNTAR = 14

/** Classe de produto que trata cada tipo de problema. */
const CLASSE_DO_TIPO: Record<string, RegExp> = {
  Praga: /inseti|acari/i,
  'Planta daninha': /herbi/i,
  Doença: /fungi/i,
}
export const classeQueTrata = (tipo: string) => ({ Praga: 'inseticida', 'Planta daninha': 'herbicida', Doença: 'fungicida' } as Record<string, string>)[tipo]

/** Classe do insumo: a cadastrada; senão a da base de mercado. */
export function classeDoInsumo(i?: Pick<Insumo, 'classe' | 'nome'>): string | null {
  return i?.classe || referenciaInsumo(i?.nome)?.classe || null
}

/** Gravidade do problema (registros antigos usavam "urgência" Baixa/Média/Alta). */
export function gravidade(c: Campo): 'Leve' | 'Média' | 'Alta' {
  if (c.gravidade) return c.gravidade
  return c.urgencia === 'Alta' ? 'Alta' : c.urgencia === 'Média' ? 'Média' : 'Leve'
}

export type Situacao = 'aberto' | 'em-tratamento' | 'perguntar' | 'resolvido'
export type Problema = { c: Campo; situacao: Situacao; tratamento?: Operacao; produto?: string; diasTratado?: number }

type Base = { operacoes: Operacao[]; produtos: OperacaoProduto[]; insumos?: Insumo[] }

/** Aplicação feita depois do problema (ou no mesmo minuto), no mesmo talhão, com produto da classe certa. */
export function tratamentoDe(c: Campo, d: Base): { op: Operacao; produto: string } | undefined {
  const re = CLASSE_DO_TIPO[c.tipo]
  if (!re) return undefined
  const desde = c.reaberto_em && c.reaberto_em > c.data_hora ? c.reaberto_em : c.data_hora
  const ops = d.operacoes.filter((o) => o.talhao_id === c.talhao_id && !o.excluido_em && o.data_hora >= desde)
    .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
  for (const o of ops) {
    for (const p of d.produtos.filter((x) => x.operacao_id === o.id)) {
      const ins = d.insumos?.find((i) => i.id === p.insumo_id)
      if (re.test(classeDoInsumo(ins) ?? '')) return { op: o, produto: ins?.nome ?? 'produto' }
    }
  }
  return undefined
}

export function situacao(c: Campo, d: Base, hoje = new Date()): Problema {
  if (c.status === 'Resolvida') return { c, situacao: 'resolvido' }
  const t = tratamentoDe(c, d)
  if (!t) return { c, situacao: 'aberto' }
  const dias = Math.floor((hoje.getTime() - new Date(t.op.data_hora).getTime()) / 864e5)
  return { c, situacao: dias >= DIAS_PERGUNTAR ? 'perguntar' : 'em-tratamento', tratamento: t.op, produto: t.produto, diasTratado: dias }
}

export type Cor = 'bom' | 'atencao' | 'critico'

/** Cor do talhão pelos problemas abertos (o que já está em tratamento não pesa). */
export function corDosProblemas(ps: Problema[]): Cor {
  const abertos = ps.filter((p) => p.situacao === 'aberto')
  if (abertos.some((p) => gravidade(p.c) === 'Alta')) return 'critico'
  if (abertos.some((p) => gravidade(p.c) === 'Média') || abertos.length >= 2) return 'atencao'
  return 'bom'
}

const PESO = { Alta: 3, Média: 2, Leve: 1 } as const
/** Problemas em aberto do mais grave ao mais leve, e do mais recente ao mais antigo. */
export const ordenar = (ps: Problema[]) =>
  [...ps].sort((a, b) => PESO[gravidade(b.c)] - PESO[gravidade(a.c)] || b.c.data_hora.localeCompare(a.c.data_hora))

export const nomeProblema = (c: Campo) => (c.alvo ? `${c.alvo}` : c.tipo === 'Planta daninha' ? 'Planta daninha' : c.tipo)
