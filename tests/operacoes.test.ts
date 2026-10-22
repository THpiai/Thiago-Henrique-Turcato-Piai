import { describe, expect, it } from 'vitest'
import { condicaoAplicacao, duracaoDias, fichaSafra, lotesAbertos, operacoesDaSafra, situacaoNoMapa } from '../src/lib/operacoes'
import { derivarCiclo } from '../src/lib/safra'
import { problema } from '../src/lib/validar'
import type { Ciclo, Operacao } from '../src/lib/tipos'

const ciclo = (x: Partial<Ciclo> = {}): Ciclo => ({ id: 'c1', talhao_id: 't1', safra: 'Safra 2026/27', cultura: 'Soja', status: 'Em andamento', ...x })
let n = 0
const op = (x: Partial<Operacao>): Operacao => ({ id: 'o' + n++, data_hora: '2026-10-05T13:00:00Z', autor_id: 'a', talhao_id: 't1', ciclo_id: 'c1', tipo: 'Plantio', ...x })
const hoje = new Date('2026-10-17T15:00:00Z')

describe('operações de vários dias', () => {
  it('conta os dias corridos incluindo o primeiro e o último', () => {
    expect(duracaoDias(op({}))).toBe(1)
    expect(duracaoDias(op({ data_hora: '2026-10-05T11:00:00Z', data_fim: '2026-10-08T20:00:00Z' }))).toBe(4)
    expect(duracaoDias(op({ data_hora: '2026-10-15T11:00:00Z', em_andamento: true }), hoje)).toBe(3)
  })
  it('junta as abertas por lote e lembra de fechar depois de 7 dias', () => {
    const l = lotesAbertos([
      op({ lote_id: 'L', talhao_id: 't1', em_andamento: true, data_hora: '2026-10-08T12:00:00Z' }),
      op({ lote_id: 'L', talhao_id: 't2', em_andamento: true, data_hora: '2026-10-08T12:00:00Z' }),
      op({ em_andamento: true, data_hora: '2026-10-16T12:00:00Z' }),
      op({}),
    ], hoje)
    expect(l.map((x) => [x.ops.length, x.dias, x.lembrar])).toEqual([[2, 9, true], [1, 1, false]])
  })
  it('colheita em andamento não fecha a safra', () => {
    const aberta = derivarCiclo(ciclo(), [op({ tipo: 'Colheita', area_ha: 100, em_andamento: true })], 100)
    expect(aberta.status).toBe('Em andamento')
    const fechada = derivarCiclo(ciclo(), [op({ tipo: 'Colheita', area_ha: 100, data_fim: '2027-02-12T18:00:00Z', producao: 6500 })], 100)
    expect([fechada.status, fechada.data_colheita, fechada.producao]).toEqual(['Colhido', '2027-02-12', 6500])
  })
})

describe('mapa da operação', () => {
  const talhoes = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }]
  const ciclos = [ciclo(), ciclo({ id: 'c2', talhao_id: 't2' }), ciclo({ id: 'c3', talhao_id: 't3', safra: 'Cana 2026/27', cultura: 'Cana-de-açúcar' })]
  it('feito, em andamento, falta e fora da safra dos talhões marcados', () => {
    const ops = [op({ tipo: 'Pulverização' }), op({ tipo: 'Pulverização', talhao_id: 't2', ciclo_id: 'c2', em_andamento: true })]
    const s = situacaoNoMapa(talhoes, ops, ciclos, 'Pulverização', ['t1'])
    expect(Object.fromEntries(s)).toEqual({ t1: 'feito', t2: 'andamento', t3: 'fora', t4: 'fora' })
    expect(situacaoNoMapa(talhoes, [], ciclos, 'Adubação', ['t1']).get('t2')).toBe('falta')
  })
  it('no plantio, talhão sem safra aberta é onde falta plantar', () => {
    expect(situacaoNoMapa(talhoes, [], ciclos, 'Plantio', []).get('t4')).toBe('falta')
  })
})

describe('ficha do talhão por safra', () => {
  it('período do plantio e da colheita, ciclo real e sobras', () => {
    const ops = [
      op({ data_hora: '2026-10-05T11:00:00Z', data_fim: '2026-10-08T20:00:00Z', sobras: [{ cultivar: 'TMG 2383', sementes: '3 bags', area_ha: 2.5 }] }),
      op({ tipo: 'Colheita', data_hora: '2027-02-10T11:00:00Z', data_fim: '2027-02-12T20:00:00Z', area_ha: 100 }),
    ]
    const f = fichaSafra(ciclo({ status: 'Colhido' }), ops, hoje)
    expect(f.plantio?.dias).toBe(4)
    expect(f.colheita?.dias).toBe(3)
    expect(f.diasCiclo).toBe(131)
    expect(f.sobras).toEqual(['TMG 2383 · 3 bags · ≈2,5 ha'])
  })
})

describe('validação', () => {
  it('término antes do início e sobra sem nome são recusados', () => {
    expect(problema('operacoes', { data_hora: '2026-10-05T13:00:00Z', data_fim: '2026-10-04T13:00:00Z' })).toMatch(/antes do início/)
    expect(problema('operacoes', { sobras: [{ cultivar: ' ' }] })).toMatch(/outra variedade/)
    expect(problema('operacoes', { data_hora: '2026-10-05T13:00:00Z', data_fim: '2026-10-06T13:00:00Z', sobras: [{ cultivar: 'X', area_ha: 2 }] }, hoje.getTime())).toBeNull()
  })
})

describe('operações da safra e aplicações', () => {
  it('dessecação e adubação antes do plantio entram na safra; as de antes da colheita anterior não', () => {
    const c = ciclo({ data_plantio: '2026-10-19' })
    const ant = ciclo({ id: 'c0', status: 'Colhido', data_colheita: '2026-08-10' })
    const ops = [
      op({ tipo: 'Plantio', data_hora: '2026-10-19T13:00:00Z' }),
      op({ id: 'des', tipo: 'Pulverização', ciclo_id: null, data_hora: '2026-10-15T13:00:00Z' }),
      op({ id: 'velha', tipo: 'Pulverização', ciclo_id: null, data_hora: '2026-08-01T13:00:00Z' }),
      op({ id: 'outro', tipo: 'Pulverização', ciclo_id: null, talhao_id: 't2', data_hora: '2026-10-15T13:00:00Z' }),
      op({ id: 'apagada', tipo: 'Adubação', ciclo_id: null, data_hora: '2026-10-10T13:00:00Z', excluido_em: '2026-10-11T00:00:00Z' }),
    ]
    const ids = operacoesDaSafra(c, ops, [c, ant]).map((o) => o.id)
    expect(ids).toContain('des')
    expect(ids).not.toContain('velha')
    expect(ids).not.toContain('outro')
    expect(ids).not.toContain('apagada')
  })
  it('condição da aplicação frente à faixa', () => {
    expect(condicaoAplicacao({ temperatura_c: 19, umidade_pct: 77, vento_kmh: 5.8 })).toEqual({ nivel: 'bom', fora: [] })
    expect(condicaoAplicacao({ temperatura_c: 21.4, umidade_pct: 69, vento_kmh: 11.6 }).fora).toEqual(['vento acima de 10 km/h'])
    expect(condicaoAplicacao({}).nivel).toBe('sem-dados')
  })
})
