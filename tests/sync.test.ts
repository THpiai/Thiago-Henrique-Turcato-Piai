import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { apagar, enviar, receber, restaurar, salvar, salvarOperacao } from '../src/lib/sync'

type Resp = { status: number; error: { message: string } | null }
/** Servidor de mentira: guarda os upserts e responde como o Supabase. */
function servidor(opcoes: { semRede?: boolean; recusa?: string } = {}) {
  const recebidos: { tabela: string; linhas: unknown[] }[] = []
  const dados: Record<string, unknown[]> = {}
  const cli = {
    from(tabela: string) {
      const q = {
        upsert: async (linhas: unknown[]): Promise<Resp> => {
          if (opcoes.semRede) throw new TypeError('Failed to fetch')
          if (tabela === opcoes.recusa) return { status: 403, error: { message: 'new row violates row-level security policy' } }
          recebidos.push({ tabela, linhas })
          dados[tabela] = [...(dados[tabela] ?? []), ...linhas]
          return { status: 201, error: null }
        },
        update: (campos: Record<string, unknown>) => ({
          eq: async (_col: string, id: string): Promise<Resp> => {
            if (opcoes.semRede) throw new TypeError('Failed to fetch')
            recebidos.push({ tabela, linhas: [{ id, ...campos, _op: 'update' }] })
            return { status: 204, error: null }
          },
        }),
        select: () => q, gte: () => q,
        then: (ok: (r: unknown) => void) => ok({ data: dados[tabela] ?? [], error: null }),
      }
      return q
    },
  }
  return { cli: cli as never, recebidos, dados }
}

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

describe('sincronização', () => {
  it('sem sinal: guarda no celular e mantém na fila', async () => {
    await salvar('chuva', [{ id: 'c1', data: '2026-10-01', talhao_id: 't', milimetros: 12, fonte: 'Pluviômetro' }])
    const s = servidor({ semRede: true })
    expect(await enviar(s.cli)).toBe('sem-rede')
    expect(await db.fila.count()).toBe(1)
    expect((await db.chuva.get('c1'))?._pendente).toBe(1)
    expect((await db.fila.toArray())[0].erro).toBeUndefined()
  })

  it('com sinal: sobe em ordem (operação antes dos produtos) e limpa a fila', async () => {
    await salvarOperacao(
      { id: 'o1', data_hora: new Date().toISOString(), autor_id: 'u', talhao_id: 't', tipo: 'Pulverização' },
      [{ id: 'p1', operacao_id: 'o1', insumo_id: 'i', dose_ha: 1, unidade: 'L' }],
    )
    const s = servidor()
    expect(await enviar(s.cli)).toBe('ok')
    expect(s.recebidos.map((r) => r.tabela)).toEqual(['operacoes', 'operacao_produtos'])
    expect(JSON.stringify(s.recebidos)).not.toContain('_pendente')
    expect(await db.fila.count()).toBe(0)
    expect((await db.operacoes.get('o1'))?._pendente).toBe(0)
  })

  it('recusa do servidor fica marcada para revisão sem travar o resto', async () => {
    await salvar('talhoes', [{ id: 't1', nome: 'T', area_ha: 1, pluviometro: false, ativo: true }])
    await salvar('chuva', [{ id: 'c1', data: '2026-10-01', talhao_id: 't1', milimetros: 3, fonte: 'Pluviômetro' }])
    const s = servidor({ recusa: 'talhoes' })
    expect(await enviar(s.cli)).toBe('com-erros')
    const fila = await db.fila.toArray()
    expect(fila).toHaveLength(1)
    expect(fila[0].erro).toMatch(/row-level/)
    expect(s.recebidos.map((r) => r.tabela)).toEqual(['chuva'])
  })

  it('receber não apaga o que ainda não subiu', async () => {
    await salvar('campo', [{ id: 'local', data_hora: new Date().toISOString(), autor_id: 'u', talhao_id: 't', tipo: 'Praga', status: 'Aberta' }])
    const s = servidor()
    s.dados.campo = [{ id: 'remoto', data_hora: new Date().toISOString(), autor_id: 'u', talhao_id: 't', tipo: 'Doença', status: 'Aberta' }]
    expect(await receber(s.cli)).toBe(true)
    expect((await db.campo.toArray()).map((c) => c.id).sort()).toEqual(['local', 'remoto'])
  })

  it('apagar manda só a marca de lixeira e restaurar tira; talhão é arquivado', async () => {
    await salvar('operacoes', [{ id: 'o9', data_hora: new Date().toISOString(), autor_id: 'u', talhao_id: 't', tipo: 'Plantio' }])
    await apagar('operacoes', ['o9'])
    expect((await db.operacoes.get('o9'))?.excluido_em).toBeTruthy()
    await restaurar('operacoes', ['o9'])
    await apagar('talhoes', ['t'])
    const s = servidor()
    expect(await enviar(s.cli)).toBe('ok')
    const ups = s.recebidos.filter((r) => (r.linhas[0] as { _op?: string })._op === 'update').map((r) => r.linhas[0])
    expect(ups).toHaveLength(3)
    expect(ups[0]).toMatchObject({ id: 'o9' })
    expect(Object.keys(ups[0] as object)).toEqual(['id', 'excluido_em', '_op'])
    expect(ups[1]).toMatchObject({ id: 'o9', excluido_em: null })
    expect(ups[2]).toMatchObject({ id: 't', ativo: false })
    expect((await db.operacoes.get('o9'))?._pendente).toBe(0)
  })
})
