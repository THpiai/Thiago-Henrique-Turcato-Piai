import { describe, expect, it } from 'vitest'
import type { Dados } from '../src/lib/painel'
import type { Ciclo, Operacao, Talhao } from '../src/lib/tipos'
import { derivarCiclos } from '../src/lib/safra'
import { atividade, faixaDaSafra, historicoSafras, linhasDaSafra, resumirRendimento, safraAnterior } from '../src/lib/rendimento'
import { faixaDoPeriodo, naFaixa, rotuloPeriodo } from '../src/lib/periodo'

const HOJE = '2026-10-28'
const tal = (id: string, area: number): Talhao => ({ id, nome: id, area_ha: area, pluviometro: false, ativo: true })
const talhoes = [tal('T1', 100), tal('T2', 50)]
const op = (o: Partial<Operacao>): Operacao => ({ id: Math.random().toString(36), autor_id: 'u', data_hora: '2026-10-01T12:00:00Z', talhao_id: 'T1', tipo: 'Outra', ...o }) as Operacao

function dados(ciclos: Ciclo[], operacoes: Operacao[] = [], extra: Partial<Dados> = {}): Dados {
  return { talhoes, ciclos: derivarCiclos(ciclos, operacoes, talhoes), operacoes, produtos: [], campo: [], chuva: [], saldos: [], sedes: [], ...extra }
}

describe('período', () => {
  it('atalhos viram datas; safra inteira não tem datas', () => {
    expect(faixaDoPeriodo({ tipo: 'safra' }, HOJE)).toBeNull()
    expect(faixaDoPeriodo({ tipo: 'dias', dias: 30 }, HOJE)).toEqual({ de: '2026-09-29', ate: HOJE })
    expect(faixaDoPeriodo({ tipo: 'ano' }, HOJE)).toEqual({ de: '2026-01-01', ate: HOJE })
    expect(rotuloPeriodo({ tipo: 'datas', de: '2025-09-01', ate: '2026-02-10' }, HOJE)).toBe('01/09/25 a 10/02')
    expect(naFaixa('2026-09-28', { de: '2026-09-29', ate: HOJE })).toBe(false)
    expect(naFaixa(null, null)).toBe(true)
  })
})

describe('rendimento', () => {
  const passadas: Ciclo[] = [
    { id: 'a1', talhao_id: 'T1', safra: 'Safra 2024/25', cultura: 'Soja', status: 'Colhido', data_plantio: '2024-10-20', data_colheita: '2025-02-20', producao: 6000, unidade_producao: 'sc', custo_insumos_ha: 2500 },
    { id: 'a2', talhao_id: 'T2', safra: 'Safra 2024/25', cultura: 'Soja', status: 'Colhido', data_plantio: '2024-10-20', data_colheita: '2025-02-20', producao: 2400, unidade_producao: 'sc', area_ha: 40 },
    { id: 'b1', talhao_id: 'T1', safra: 'Safra 2025/26', cultura: 'Soja', status: 'Colhido', data_plantio: '2025-10-20', data_colheita: '2026-02-20', producao: 7000, unidade_producao: 'sc', custo_insumos_ha: 3000 },
  ]

  it('safra passada: produtividade pela área plantada, média pesada e custo informado', () => {
    const d = dados(passadas)
    const ls = linhasDaSafra(d, 'Soja 2024/25', null, null, HOJE)
    expect(ls.map((l) => [l.talhao.id, l.area, l.produtividade])).toEqual([['T1', 100, 60], ['T2', 40, 60]])
    const k = resumirRendimento(ls)
    expect(k.area).toBe(140)
    expect(k.culturas[0].produtividade).toBe(60)
    expect(k.culturas[0].regional?.valor).toBe(65)
    // Só T1 tem custo: a média é a dele.
    expect(k.custoHa).toBe(2500)
    expect(ls[0].custoInformado).toBe(true)
  })

  it('comparativo junta só safras da mesma família, da mais antiga à mais nova', () => {
    const d = dados([...passadas, { id: 'm', talhao_id: 'T1', safra: 'Safrinha 2025', cultura: 'Milho', status: 'Colhido', producao: 9000, data_colheita: '2025-07-01' }])
    const h = historicoSafras(d, 'Soja 2025/26', null, HOJE)
    expect(h.map((x) => x.safra)).toEqual(['Soja 2024/25', 'Soja 2025/26'])
    expect(h[1].culturas.get('Soja')?.produtividade).toBe(70)
    expect(safraAnterior(h, 'Soja 2025/26')?.safra).toBe('Soja 2024/25')
  })

  it('safra no app: colheitas e custo das aplicações dentro do período', () => {
    const c: Ciclo = { id: 'c', talhao_id: 'T1', safra: 'Safra 2025/26', cultura: 'Soja', status: 'Em andamento', data_plantio: '2025-10-15' }
    const ops = [
      op({ ciclo_id: 'c', tipo: 'Plantio', data_hora: '2025-10-15T12:00:00Z', area_ha: 100 }),
      op({ id: 'p1', ciclo_id: 'c', tipo: 'Pulverização', data_hora: '2025-12-10T12:00:00Z', area_ha: 100 }),
      op({ ciclo_id: 'c', tipo: 'Colheita', data_hora: '2026-02-10T12:00:00Z', area_ha: 60, producao: 4200 }),
      op({ ciclo_id: 'c', tipo: 'Colheita', data_hora: '2026-02-20T12:00:00Z', area_ha: 40, producao: 2600 }),
    ]
    const d = dados([c], ops, {
      produtos: [{ id: 'x', operacao_id: 'p1', insumo_id: 'i', dose_ha: 1, unidade: 'L', quantidade_total: 100 }],
      saldos: [{ insumo_id: 'i', nome: 'F', unidade: 'L', saldo: 1, custo_medio: 150 }],
    })
    const tudo = linhasDaSafra(d, 'Soja 2025/26', ['T1'], null, HOJE)[0]
    expect(tudo.producao).toBe(6800)
    expect(tudo.produtividade).toBe(68)
    expect(tudo.custoHa).toBe(150)
    // Só a primeira colheita e nada de aplicação no período.
    const parte = linhasDaSafra(d, 'Soja 2025/26', ['T1'], { de: '2026-02-01', ate: '2026-02-15' }, HOJE)[0]
    expect([parte.producao, parte.areaColhida, parte.produtividade, parte.custoHa]).toEqual([4200, 60, 70, null])
    expect(faixaDaSafra([tudo.ciclo], HOJE)).toEqual({ de: '2025-07-17', ate: '2026-02-20' })
  })

  it('atividade: operações, hectares por tipo e insumos', () => {
    const ops = [op({ id: 'a', tipo: 'Pulverização', area_ha: 80 }), op({ id: 'b', tipo: 'Pulverização' }), op({ id: 'c', tipo: 'Adubação', talhao_id: 'T2' })]
    const a = atividade(ops, { talhoes, produtos: [{ id: 'x', operacao_id: 'a', insumo_id: 'i', dose_ha: 0.5, unidade: 'L' }], saldos: [{ insumo_id: 'i', nome: 'F', unidade: 'L', saldo: 1, custo_medio: 10 }], insumos: [] })
    expect([a.operacoes, a.ha, a.aplicacoes, a.custo]).toEqual([3, 230, 2, 400])
    expect(a.porTipo[0]).toEqual({ tipo: 'Pulverização', n: 2, ha: 180 })
  })
})
