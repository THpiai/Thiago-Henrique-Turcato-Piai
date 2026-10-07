import type { TalhaoGeo } from './geo'

/** Campo local: 1 enquanto o registro ainda não subiu para o servidor. */
type Local = { _pendente?: 0 | 1 }

export type Perfil = 'dono' | 'encarregado' | 'operador'
export type Pessoa = { id: string; nome: string; email: string; perfil: Perfil; ativo: boolean }

export type Talhao = TalhaoGeo & Local & {
  nome: string; area_ha: number; pluviometro: boolean; ativo: boolean; observacao?: string | null
}
export type Insumo = Local & {
  id: string; nome: string; tipo: string; unidade: string; estoque_minimo?: number | null; ativo: boolean
}
export type Ciclo = Local & {
  id: string; talhao_id: string; safra: string; cultura: string; cultivar?: string | null
  ciclo_cultivar_dias?: number | null; data_plantio?: string | null; populacao_plantas_ha?: number | null
  estadio_atual?: string | null; data_estadio?: string | null; colheita_prevista?: string | null
  data_colheita?: string | null; producao?: number | null; unidade_producao?: 'sc' | 't' | null
  meta_por_ha?: number | null; corte_cana?: number | null; atr_kg_t?: number | null
  status: 'Planejado' | 'Em andamento' | 'Colhido'; observacao?: string | null
}
export type Operacao = Local & {
  id: string; data_hora: string; autor_id: string; talhao_id: string; ciclo_id?: string | null; tipo: string
  area_ha?: number | null; horas?: number | null; alvo?: string | null; volume_calda_l_ha?: number | null
  temperatura_c?: number | null; umidade_pct?: number | null; vento_kmh?: number | null
  receituario?: string | null; latitude?: number | null; longitude?: number | null; observacao?: string | null
}
export type OperacaoProduto = Local & {
  id: string; operacao_id: string; insumo_id: string; dose_ha: number; unidade: string; quantidade_total?: number | null
}
export type Campo = Local & {
  id: string; data_hora: string; autor_id: string; talhao_id: string; ciclo_id?: string | null; tipo: string
  alvo?: string | null; nivel_encontrado?: number | null; unidade_nivel?: string | null; nivel_de_controle?: number | null
  urgencia?: 'Baixa' | 'Média' | 'Alta' | null; status: string; latitude?: number | null; longitude?: number | null
  descricao?: string | null; resolvido_em?: string | null
}
export type EstoqueMov = Local & {
  id: string; data: string; autor_id: string; insumo_id: string; movimento: string; quantidade: number
  valor_total?: number | null; nota_fiscal?: string | null; fornecedor?: string | null; observacao?: string | null
}
export type Chuva = Local & {
  id: string; data: string; talhao_id?: string | null; milimetros: number; fonte: string; autor_id?: string | null; observacao?: string | null
}
export type Saldo = {
  insumo_id: string; nome: string; unidade: string; estoque_minimo?: number | null; saldo: number; custo_medio?: number | null
}
