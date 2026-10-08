import type { SupabaseClient } from '@supabase/supabase-js'
import { db, gravarMeta, TABELAS_CADASTRO, TABELAS_REGISTRO, type TabelaSync } from './db'
import type { Ciclo, Operacao, OperacaoProduto } from './tipos'

type Cliente = Pick<SupabaseClient, 'from'>
type Linha = Record<string, unknown> & { id: string }

const DIAS_HISTORICO = 180
const semLocais = (l: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(l).filter(([k]) => !k.startsWith('_')))

/** Grava no celular na hora e põe na fila de envio. Funciona sem sinal. */
export async function salvar(tabela: TabelaSync, linhas: Linha[]) {
  await db.transaction('rw', [db.table(tabela), db.fila], async () => {
    await db.table(tabela).bulkPut(linhas.map((l) => ({ ...l, _pendente: 1 })))
    await db.fila.add({ tabela, linhas: linhas.map(semLocais), criado_em: new Date().toISOString(), tentativas: 0 })
  })
  avisar()
  aoSalvar.forEach((f) => f())
}
const aoSalvar = new Set<() => void>()

/** Muda só alguns campos de registros existentes (serve para quem não é o autor, como o gestor). */
export async function alterar(tabela: TabelaSync, ids: string[], campos: Record<string, unknown>) {
  await db.transaction('rw', [db.table(tabela), db.fila], async () => {
    for (const id of ids) await db.table(tabela).update(id, { ...campos, _pendente: 1 })
    await db.fila.add({ tabela, op: 'update', linhas: ids.map((id) => ({ id, ...campos })), criado_em: new Date().toISOString(), tentativas: 0 })
  })
  avisar()
  aoSalvar.forEach((f) => f())
}

/** Manda para a lixeira (ou tira dela). Talhão é arquivado; o resto ganha data de exclusão. */
export const apagar = (tabela: TabelaSync, ids: string[]) =>
  tabela === 'talhoes' ? alterar(tabela, ids, { ativo: false }) : alterar(tabela, ids, { excluido_em: new Date().toISOString() })
export const restaurar = (tabela: TabelaSync, ids: string[]) =>
  tabela === 'talhoes' ? alterar(tabela, ids, { ativo: true }) : alterar(tabela, ids, { excluido_em: null })

/** Operação e seus produtos entram juntos e sobem na ordem certa.
 *  Plantio sem safra aberta: a safra aparece na hora no celular e o servidor cria a dele com o mesmo id. */
export async function salvarOperacao(op: Operacao, produtos: OperacaoProduto[], novaSafra?: Ciclo) {
  if (novaSafra) await db.ciclos.put({ ...novaSafra, _auto: 1 } as Ciclo)
  await salvar('operacoes', [op as Linha])
  if (produtos.length) await salvar('operacao_produtos', produtos as Linha[])
}

export type Estado = { pendentes: number; comErro: number; enviando: boolean; ultimaSync?: string; online: boolean }
let enviando = false
const ouvintes = new Set<() => void>()
export const ouvirSync = (f: () => void) => (ouvintes.add(f), () => void ouvintes.delete(f))
const avisar = () => ouvintes.forEach((f) => f())

export async function estado(): Promise<Estado> {
  // Produtos da calda contam junto com a operação: para quem usa, é um registro só.
  const itens = (await db.fila.toArray()).filter((i) => i.tabela !== 'operacao_produtos' || i.erro)
  return {
    pendentes: itens.length,
    comErro: itens.filter((i) => i.erro).length,
    enviando,
    ultimaSync: (await db.meta.get('ultimaSync'))?.valor as string | undefined,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  }
}

// Sem resposta do servidor (status 0) ou sessão vencida: tenta de novo depois, sem marcar erro.
const falhaDeRede = (status: number, msg = '') =>
  status === 0 || status === 401 || /fetch|network|Failed to/i.test(msg)

/** Envia a fila em ordem. Para no primeiro problema de rede; erros de dados ficam marcados para revisão. */
export async function enviar(cli: Cliente): Promise<'ok' | 'sem-rede' | 'com-erros'> {
  if (enviando) return 'ok'
  enviando = true
  avisar()
  let resultado: 'ok' | 'sem-rede' | 'com-erros' = 'ok'
  try {
    for (const item of await db.fila.orderBy('seq').toArray()) {
      let status = 0, msg = ''
      try {
        let r: { status: number; error: { message: string } | null } = { status: 200, error: null }
        if (item.op === 'update') {
          for (const { id, ...campos } of item.linhas) {
            r = await cli.from(item.tabela).update(campos).eq('id', id as string)
            if (r.error) break
          }
        } else r = await cli.from(item.tabela).upsert(item.linhas, { onConflict: 'id' })
        status = r.status
        msg = r.error?.message ?? ''
        if (!r.error) {
          await db.transaction('rw', [db.table(item.tabela), db.fila], async () => {
            await db.fila.delete(item.seq!)
            const ids = item.linhas.map((l) => l.id as string)
            const aindaNaFila = new Set(
              (await db.fila.where('seq').above(item.seq!).toArray())
                .filter((i) => i.tabela === item.tabela)
                .flatMap((i) => i.linhas.map((l) => l.id as string)),
            )
            for (const id of ids) if (!aindaNaFila.has(id)) await db.table(item.tabela).update(id, { _pendente: 0 })
          })
          continue
        }
      } catch (e) {
        msg = String(e)
      }
      if (falhaDeRede(status, msg)) { resultado = 'sem-rede'; break }
      await db.fila.update(item.seq!, { tentativas: item.tentativas + 1, erro: msg || `Erro ${status}` })
      resultado = 'com-erros'
    }
    if (resultado !== 'sem-rede') await gravarMeta('ultimaSync', new Date().toISOString())
  } finally {
    enviando = false
    avisar()
  }
  return resultado
}

/** Baixa cadastros e o histórico recente. Registros ainda na fila nunca são sobrescritos. */
export async function receber(cli: Cliente): Promise<boolean> {
  const desde = new Date(Date.now() - DIAS_HISTORICO * 864e5).toISOString()
  const filtro: Partial<Record<TabelaSync, [string, string]>> = {
    operacoes: ['data_hora', desde], campo: ['data_hora', desde],
    estoque_mov: ['data', desde.slice(0, 10)], chuva: ['data', desde.slice(0, 10)],
  }
  const baixados: [TabelaSync, Linha[]][] = []
  for (const t of [...TABELAS_CADASTRO, ...TABELAS_REGISTRO]) {
    let q = cli.from(t).select('*')
    const f = filtro[t]
    if (f) q = q.gte(f[0], f[1])
    const { data, error } = await q
    if (error) return false
    baixados.push([t, data as Linha[]])
  }
  const saldos = await cli.from('v_estoque').select('insumo_id,nome,unidade,estoque_minimo,saldo,custo_medio')
  if (saldos.error) return false
  // Clima por hora (ontem até a previsão): preenche a condição de aplicação sem sinal.
  const clima = await cli.from('clima_horario').select('sede_id,hora,temperatura_c,umidade_pct,vento_kmh,chuva_mm')
    .gte('hora', new Date(Date.now() - 2 * 864e5).toISOString())
  if (clima.error) return false

  await db.transaction('rw', [...baixados.map(([t]) => db.table(t)), db.saldos, db.clima], async () => {
    for (const [t, linhas] of baixados) {
      const tabela = db.table(t)
      // Safra criada no celular pelo Plantio fica até o servidor devolver a dele.
      const idsServidor = new Set(linhas.map((l) => l.id))
      const pendentes = await tabela.filter((l) => l._pendente === 1 || (l._auto === 1 && !idsServidor.has(l.id))).toArray()
      const idsPend = new Set(pendentes.map((l) => l.id))
      await tabela.clear()
      await tabela.bulkPut([...linhas.filter((l) => !idsPend.has(l.id)).map((l) => ({ ...l, _pendente: 0 })), ...pendentes])
    }
    await db.saldos.clear()
    await db.saldos.bulkPut(saldos.data as never[])
    await db.clima.clear()
    await db.clima.bulkPut(clima.data as never[])
  })
  avisar()
  return true
}

export async function sincronizar(cli: Cliente) {
  const r = await enviar(cli)
  if (r !== 'sem-rede') await receber(cli)
  avisar()
  return r
}

/** Liga a sincronização automática: ao voltar o sinal, a cada minuto e depois de cada registro. */
export function iniciarSync(cli: Cliente) {
  const vai = () => { if (navigator.onLine) void sincronizar(cli) }
  window.addEventListener('online', vai)
  const relogio = setInterval(vai, 60_000)
  const aposSalvar = () => { if (navigator.onLine) void enviar(cli) }
  aoSalvar.add(aposSalvar)
  const tira = () => void aoSalvar.delete(aposSalvar)
  vai()
  return () => { window.removeEventListener('online', vai); clearInterval(relogio); tira() }
}
