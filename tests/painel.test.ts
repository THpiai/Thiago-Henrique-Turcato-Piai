import { describe, expect, it } from 'vitest'
import { chuvaPeriodo, cicloAtual, resumoTalhao, statusMip, type Dados } from '../src/lib/painel'
import type { Chuva, Ciclo, Talhao } from '../src/lib/tipos'

const dia = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const t: Talhao = { id: 't1', nome: 'T01', area_ha: 50, pluviometro: true, ativo: true }

describe('painel', () => {
  it('ciclo em andamento vem antes do colhido', () => {
    const cs = [
      { id: 'a', talhao_id: 't1', safra: 'S1', cultura: 'Soja', status: 'Colhido', data_plantio: dia(200) },
      { id: 'b', talhao_id: 't1', safra: 'S2', cultura: 'Milho', status: 'Em andamento', data_plantio: dia(30) },
    ] as Ciclo[]
    expect(cicloAtual('t1', cs)?.id).toBe('b')
  })
  it('chuva: pluviômetro do talhão substitui a estimativa do mesmo dia', () => {
    const ch = [
      { id: '1', data: dia(1), talhao_id: 't1', milimetros: 20, fonte: 'Pluviômetro' },
      { id: '2', data: dia(1), talhao_id: null, milimetros: 12, fonte: 'Estimativa automática' },
      { id: '3', data: dia(2), talhao_id: null, milimetros: 5, fonte: 'Estimativa automática' },
      { id: '4', data: dia(40), talhao_id: 't1', milimetros: 99, fonte: 'Pluviômetro' },
    ] as Chuva[]
    expect(chuvaPeriodo('t1', ch, 7)).toBe(25)
    expect(chuvaPeriodo('t1', ch, 30)).toBe(25)
  })
  it('MIP segue a regra do banco', () => {
    expect(statusMip('Praga', 3, 2)).toBe('Aplicação indicada')
    expect(statusMip('Praga', 1, 2)).toBe('Monitorando')
    expect(statusMip('Máquina', 3, 2)).toBe('Aberta')
  })
  it('resumo: DAP, custo por ha e produtividade', () => {
    const d: Dados = {
      talhoes: [t],
      ciclos: [{ id: 'c', talhao_id: 't1', safra: 'S', cultura: 'Soja', status: 'Em andamento', data_plantio: dia(40), ciclo_cultivar_dias: 120, meta_por_ha: 70 }],
      operacoes: [{ id: 'o', data_hora: new Date().toISOString(), autor_id: 'u', talhao_id: 't1', ciclo_id: 'c', tipo: 'Pulverização', area_ha: 50 }],
      produtos: [{ id: 'p', operacao_id: 'o', insumo_id: 'i', dose_ha: 0.5, unidade: 'L', quantidade_total: 25 }],
      campo: [], chuva: [],
      saldos: [{ insumo_id: 'i', nome: 'X', unidade: 'L', saldo: 100, custo_medio: 80 }],
    }
    const r = resumoTalhao(t, d)
    expect(r.dap).toBe(40)
    expect(r.diasParaColheita).toBe(80)
    expect(r.progresso).toBeCloseTo(1 / 3)
    expect(r.custoHa).toBe(40)
    d.ciclos[0] = { ...d.ciclos[0], status: 'Colhido', producao: 3500, unidade_producao: 'sc' }
    const r2 = resumoTalhao(t, d)
    expect(r2.produtividade).toBe(70)
    expect(r2.vsMeta).toBe(1)
  })
})
