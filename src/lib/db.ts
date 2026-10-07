import Dexie, { type Table } from 'dexie'
import type { Campo, Chuva, Ciclo, ClimaHora, EstoqueMov, Insumo, Operacao, OperacaoProduto, Pessoa, Saldo, Sede, Talhao } from './tipos'

/** Item da fila de envio: o que foi gravado no celular e ainda não chegou ao servidor. */
export type ItemFila = {
  seq?: number
  tabela: TabelaSync
  linhas: Record<string, unknown>[]
  criado_em: string
  tentativas: number
  erro?: string | null
}

export const TABELAS_CADASTRO = ['pessoas', 'sedes', 'talhoes', 'insumos', 'ciclos'] as const
export const TABELAS_REGISTRO = ['operacoes', 'operacao_produtos', 'campo', 'estoque_mov', 'chuva'] as const
export type TabelaSync = (typeof TABELAS_CADASTRO)[number] | (typeof TABELAS_REGISTRO)[number]

/** Banco local do celular (IndexedDB). Tudo funciona daqui; o servidor é sincronizado quando há sinal. */
export class BancoLocal extends Dexie {
  pessoas!: Table<Pessoa, string>
  sedes!: Table<Sede, string>
  clima!: Table<ClimaHora, [string, string]>
  talhoes!: Table<Talhao, string>
  insumos!: Table<Insumo, string>
  ciclos!: Table<Ciclo, string>
  operacoes!: Table<Operacao, string>
  operacao_produtos!: Table<OperacaoProduto, string>
  campo!: Table<Campo, string>
  estoque_mov!: Table<EstoqueMov, string>
  chuva!: Table<Chuva, string>
  saldos!: Table<Saldo, string>
  fila!: Table<ItemFila, number>
  meta!: Table<{ chave: string; valor: unknown }, string>

  constructor(nome = 'flor-da-mata') {
    super(nome)
    this.version(1).stores({
      pessoas: 'id',
      talhoes: 'id, nome',
      insumos: 'id, nome',
      ciclos: 'id, talhao_id, status',
      operacoes: 'id, talhao_id, ciclo_id, data_hora',
      operacao_produtos: 'id, operacao_id, insumo_id',
      campo: 'id, talhao_id, status, data_hora',
      estoque_mov: 'id, insumo_id, data',
      chuva: 'id, talhao_id, data',
      saldos: 'insumo_id',
      fila: '++seq',
      meta: 'chave',
    })
    this.version(2).stores({ sedes: 'id', clima: '[sede_id+hora], sede_id' })
  }
}

export const db = new BancoLocal()

export async function lerMeta<T>(chave: string): Promise<T | undefined> {
  return (await db.meta.get(chave))?.valor as T | undefined
}
export const gravarMeta = (chave: string, valor: unknown) => db.meta.put({ chave, valor })
