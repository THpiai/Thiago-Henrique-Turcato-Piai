import { describe, expect, it } from 'vitest'
import { derivarCiclo, diagnosticoSafra, estadioEstimado, nomeSafra, cicloAberto, type CicloVivo } from '../src/lib/safra'
import type { Ciclo, Operacao } from '../src/lib/tipos'

const ciclo = (x: Partial<Ciclo> = {}): Ciclo => ({ id: 'c1', talhao_id: 't1', safra: 'Safra 2026/27', cultura: 'Soja', status: 'Planejado', ...x })
const op = (x: Partial<Operacao>): Operacao => ({ id: Math.random().toString(), data_hora: '2026-10-05T13:00:00Z', autor_id: 'a', talhao_id: 't1', ciclo_id: 'c1', tipo: 'Plantio', ...x })

describe('safra a partir das operações', () => {
  it('nomeia a safra como o banco', () => {
    expect(nomeSafra('Soja', '2026-10-05')).toBe('Safra 2026/27')
    expect(nomeSafra('Milho', '2027-02-20')).toBe('Safrinha 2027')
    expect(nomeSafra('Cana-de-açúcar', '2027-03-01')).toBe('Cana 2026/27')
  })
  it('plantio abre a safra e traz cultivar; colheita soma produção e fecha com 95% da área', () => {
    const ops = [
      op({ cultivar: 'BRS 1003', populacao_plantas_ha: 300000, area_ha: 100 }),
      op({ tipo: 'Colheita', data_hora: '2027-02-10T15:00:00Z', area_ha: 60, producao: 3800, unidade_producao: 'sc' }),
    ]
    let c = derivarCiclo(ciclo(), ops, 100)
    expect(c.status).toBe('Em andamento')
    expect(c.data_plantio).toBe('2026-10-05')
    expect(c.cultivar).toBe('BRS 1003')
    expect(c.producao).toBe(3800)
    expect(c.fracaoColhida).toBeCloseTo(0.6)
    ops.push(op({ tipo: 'Colheita', data_hora: '2027-02-12T15:00:00Z', area_ha: 40, producao: 2500 }))
    c = derivarCiclo(ciclo(), ops, 100)
    expect(c.status).toBe('Colhido')
    expect(c.producao).toBe(6300)
    expect(c.data_colheita).toBe('2027-02-12')
  })
  it('operação apagada não conta', () => {
    const c = derivarCiclo(ciclo(), [op({ excluido_em: '2026-10-06' })], 100)
    expect(c.status).toBe('Planejado')
  })
  it('safra aberta prefere a em andamento', () => {
    const l = [ciclo({ id: 'p' }), ciclo({ id: 'e', status: 'Em andamento' }), ciclo({ id: 'x', status: 'Colhido' })]
    expect(cicloAberto('t1', l)?.id).toBe('e')
  })
  it('estima o estádio pelos dias de plantio', () => {
    expect(estadioEstimado({ cultura: 'Soja', ciclo_cultivar_dias: 120, safra: '' }, 3)).toBe('Emergência (VE)')
    expect(estadioEstimado({ cultura: 'Soja', ciclo_cultivar_dias: 120, safra: '' }, 30)).toBe('Vegetativo (V)')
    expect(estadioEstimado({ cultura: 'Soja', ciclo_cultivar_dias: 120, safra: '' }, 75)).toBe('Formação de grãos (R3-R5)')
    expect(estadioEstimado({ cultura: 'Cana-de-açúcar', ciclo_cultivar_dias: null, safra: '' }, 200)).toBe('Cana: Crescimento')
  })
})

describe('estado da safra', () => {
  const base = { areaHa: 100, diasParaColheita: 60, operacoes: [], campo: [], chuva7: 10, chuva15: 40, chuva30: 90, produtividade: null, custoHa: null, custoEstimado: false }
  const viva = (x: Partial<CicloVivo> = {}): CicloVivo => ({ ...ciclo({ status: 'Em andamento', data_plantio: '2026-10-05', ciclo_cultivar_dias: 120, cultivar: 'X', populacao_plantas_ha: 1 }), areaColhida: 0, fracaoColhida: 0, producaoDasOperacoes: false, ...x })
  const hoje = new Date('2026-12-15T12:00:00Z')

  it('sem safra pede o plantio', () => {
    expect(diagnosticoSafra({ ...base, dap: null }).nivel).toBe('sem-dados')
  })
  it('alerta de MIP sem pulverização depois é crítico', () => {
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 40, campo: [{ id: 'm', data_hora: '2026-12-12T12:00:00Z', autor_id: 'a', talhao_id: 't1', tipo: 'Praga', alvo: 'percevejo', status: 'Aplicação indicada' }] }, hoje)
    expect(d.nivel).toBe('critico')
    expect(d.pontos[0].texto).toMatch(/percevejo/)
  })
  it('pulverização depois do alerta vira atenção', () => {
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 40,
      campo: [{ id: 'm', data_hora: '2026-12-12T12:00:00Z', autor_id: 'a', talhao_id: 't1', tipo: 'Praga', status: 'Aplicação indicada' }],
      operacoes: [op({ tipo: 'Pulverização', data_hora: '2026-12-13T12:00:00Z' })] }, hoje)
    expect(d.nivel).toBe('atencao')
  })
  it('pouca chuva no enchimento de grãos pede atenção', () => {
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 75, chuva15: 12, campo: [{ id: 'm', data_hora: '2026-12-14T12:00:00Z', autor_id: 'a', talhao_id: 't1', tipo: 'Praga', status: 'Resolvida' }] }, hoje)
    expect(d.estadio).toBe('Formação de grãos (R3-R5)')
    expect(d.estadioEstimado).toBe(true)
    expect(d.pontos.some((p) => /12 mm/.test(p.texto))).toBe(true)
  })
  it('lavoura monitorada e com chuva fica em dia', () => {
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 30, campo: [{ id: 'm', data_hora: '2026-12-12T12:00:00Z', autor_id: 'a', talhao_id: 't1', tipo: 'Praga', status: 'Resolvida' }] }, hoje)
    expect(d.nivel).toBe('bom')
  })
})
