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
      campo: [], chuva: [], sedes: [],
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

import { janelasAplicacao, sedeDoTalhao } from '../src/lib/painel'
describe('sedes e clima', () => {
  const sedes = [
    { id: 'fm', nome: 'Flor da Mata', latitude: -19.831513, longitude: -48.855723 },
    { id: 'ca', nome: 'Carlim', latitude: -19.984539, longitude: -48.802805 },
  ]
  it('talhão usa a sede mais próxima; sem desenho, a Flor da Mata', () => {
    expect(sedeDoTalhao({ latitude: -19.97, longitude: -48.81 }, sedes)?.id).toBe('ca')
    expect(sedeDoTalhao({ contorno: null }, sedes)?.id).toBe('fm')
  })
  it('estimativa da sede certa entra na chuva do talhão', () => {
    const ch = [
      { id: '1', data: dia(1), talhao_id: null, sede_id: 'fm', milimetros: 10, fonte: 'Estimativa automática' },
      { id: '2', data: dia(1), talhao_id: null, sede_id: 'ca', milimetros: 30, fonte: 'Estimativa automática' },
    ] as Chuva[]
    expect(chuvaPeriodo('t9', ch, 7, 'ca')).toBe(30)
    expect(chuvaPeriodo('t9', ch, 7, 'fm')).toBe(10)
  })
  it('junta horas boas seguidas numa janela de aplicação', () => {
    const base = new Date('2026-10-08T09:00:00Z').getTime()
    const h = (i: number, vento: number) => ({ sede_id: 'fm', hora: new Date(base + i * 3600e3).toISOString(), temperatura_c: 24, umidade_pct: 70, vento_kmh: vento, chuva_mm: 0 })
    const j = janelasAplicacao([h(0, 5), h(1, 6), h(2, 15), h(3, 4)], 'fm', new Date(base), 12)
    expect(j).toHaveLength(2)
    expect(j[0].fim).toBe(h(1, 0).hora)
  })
})
