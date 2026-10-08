import { describe, expect, it } from 'vitest'
import { derivarCiclo, diagnosticoSafra, estadioDaSafra, estadioEstimado, nomeSafra, cicloAberto, type CicloVivo } from '../src/lib/safra'
import { corDosProblemas, situacao, type Problema } from '../src/lib/problemas'
import type { Campo, Ciclo, Operacao } from '../src/lib/tipos'

const ciclo = (x: Partial<Ciclo> = {}): Ciclo => ({ id: 'c1', talhao_id: 't1', safra: 'Safra 2026/27', cultura: 'Soja', status: 'Planejado', ...x })
const op = (x: Partial<Operacao>): Operacao => ({ id: Math.random().toString(), data_hora: '2026-10-05T13:00:00Z', autor_id: 'a', talhao_id: 't1', ciclo_id: 'c1', tipo: 'Plantio', ...x })

describe('safra a partir das operações', () => {
  it('nomeia a safra como o banco', () => {
    expect(nomeSafra('Soja', '2026-10-05')).toBe('Soja 2026/27')
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
  const est = { vale: 'Vegetativo (V)', valeConfirmado: false }
  const base = { areaHa: 100, diasParaColheita: 60, problemas: [], estadio: est, chuva7: 10, chuva15: 40, chuva30: 90, produtividade: null, custoHa: null, custoEstimado: false }
  const viva = (x: Partial<CicloVivo> = {}): CicloVivo => ({ ...ciclo({ status: 'Em andamento', data_plantio: '2026-10-05', ciclo_cultivar_dias: 120, cultivar: 'X', populacao_plantas_ha: 1 }), areaColhida: 0, fracaoColhida: 0, producaoDasOperacoes: false, ...x })
  const prob = (x: Partial<Campo>, sit: Problema['situacao'] = 'aberto'): Problema => ({ c: { id: Math.random().toString(), data_hora: new Date().toISOString(), autor_id: 'a', talhao_id: 't1', tipo: 'Praga', status: 'Aberta', ...x }, situacao: sit })

  it('sem safra pede o plantio', () => {
    expect(diagnosticoSafra({ ...base, dap: null }).nivel).toBe('sem-dados')
  })
  it('problema grave aberto deixa o talhão crítico e vira o ponto de atenção', () => {
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 40, problemas: [prob({ alvo: 'Percevejo', gravidade: 'Alta', quem_viu: 'Agrônomo' })] })
    expect(d.nivel).toBe('critico')
    expect(d.agora).toMatch(/Percevejo \(alta\).*agrônomo.*sem inseticida/)
  })
  it('problema em tratamento não pesa na cor nem vira ponto de atenção', () => {
    const p = { ...prob({ alvo: 'Ferrugem', tipo: 'Doença', gravidade: 'Alta' }, 'em-tratamento'), produto: 'Fox Xpro', diasTratado: 3 }
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 40, problemas: [p] })
    expect(d.nivel).toBe('bom')
    expect(d.agora).toBeNull()
  })
  it('depois do prazo pergunta se resolveu', () => {
    const p = { ...prob({ alvo: 'Buva', tipo: 'Planta daninha' }, 'perguntar'), produto: 'Zapp', diasTratado: 15 }
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 40, problemas: [p] })
    expect(d.pontos.some((x) => /Resolveu\?/.test(x.texto))).toBe(true)
  })
  it('média ou dois leves dão atenção; um leve fica em dia', () => {
    expect(diagnosticoSafra({ ...base, ciclo: viva(), dap: 40, problemas: [prob({ gravidade: 'Média' })] }).nivel).toBe('atencao')
    expect(diagnosticoSafra({ ...base, ciclo: viva(), dap: 40, problemas: [prob({ gravidade: 'Leve' }), prob({ gravidade: 'Leve' })] }).nivel).toBe('atencao')
    expect(diagnosticoSafra({ ...base, ciclo: viva(), dap: 40, problemas: [prob({ gravidade: 'Leve' })] }).nivel).toBe('bom')
  })
  it('não existe mais alerta de monitoramento atrasado', () => {
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 60 })
    expect(d.nivel).toBe('bom')
    expect(d.pontos.some((x) => /monitoramento/i.test(x.texto))).toBe(false)
  })
  it('pouca chuva no enchimento de grãos pede atenção', () => {
    const d = diagnosticoSafra({ ...base, ciclo: viva(), dap: 75, chuva15: 12, estadio: { vale: 'Formação de grãos (R3-R5)', valeConfirmado: true } })
    expect(d.estadioEstimado).toBe(false)
    expect(d.pontos.some((p) => /12 mm/.test(p.texto))).toBe(true)
  })
})

describe('estádio estimado e confirmado', () => {
  const c = derivarCiclo(ciclo({ status: 'Em andamento', data_plantio: '2026-10-05', ciclo_cultivar_dias: 120 }), [], 100)
  const hoje = new Date('2026-11-04T12:00:00Z')
  it('sem confirmação vale o estimado', () => {
    const e = estadioDaSafra(c, 30, [], hoje)
    expect(e.vale).toBe('Vegetativo (V)')
    expect(e.valeConfirmado).toBe(false)
  })
  it('confirmado no campo recente vale mais', () => {
    const e = estadioDaSafra(c, 30, [{ id: 'e', data_hora: '2026-11-01T12:00:00Z', autor_id: 'a', talhao_id: 't1', ciclo_id: 'c1', estadio: 'Pré-florescimento' }], hoje)
    expect(e.vale).toBe('Pré-florescimento')
    expect(e.valeConfirmado).toBe(true)
  })
  it('confirmação velha volta para o estimado', () => {
    const e = estadioDaSafra(c, 30, [{ id: 'e', data_hora: '2026-10-10T12:00:00Z', autor_id: 'a', talhao_id: 't1', ciclo_id: 'c1', estadio: 'Emergência (VE)' }], hoje)
    expect(e.valeConfirmado).toBe(false)
    expect(e.confirmado?.estadio).toBe('Emergência (VE)')
  })
})

describe('tratamento detectado sozinho', () => {
  const insumos = [
    { id: 'ins', nome: 'Engeo Pleno S', tipo: 'Defensivo', unidade: 'L', ativo: true, classe: 'Inseticida' },
    { id: 'fun', nome: 'Produto qualquer', tipo: 'Defensivo', unidade: 'L', ativo: true, classe: 'Fungicida' },
    { id: 'sem', nome: 'Fox Xpro', tipo: 'Defensivo', unidade: 'L', ativo: true },
  ]
  const praga = { id: 'p', data_hora: '2026-11-01T12:00:00Z', autor_id: 'a', talhao_id: 't1', tipo: 'Praga', status: 'Aberta' } as Campo
  const aplic = (id: string, insumo: string, quando: string, talhao = 't1') => ({
    op: op({ id, tipo: 'Pulverização', data_hora: quando, talhao_id: talhao }),
    p: { id: 'x' + id, operacao_id: id, insumo_id: insumo, dose_ha: 1, unidade: 'L' },
  })
  const base = (...a: ReturnType<typeof aplic>[]) => ({ operacoes: a.map((x) => x.op), produtos: a.map((x) => x.p), insumos })

  it('fungicida não trata praga; inseticida depois do problema trata', () => {
    expect(situacao(praga, base(aplic('a', 'fun', '2026-11-02T12:00:00Z')), new Date('2026-11-05')).situacao).toBe('aberto')
    expect(situacao(praga, base(aplic('b', 'ins', '2026-11-02T12:00:00Z')), new Date('2026-11-05')).situacao).toBe('em-tratamento')
  })
  it('aplicação antes do problema ou em outro talhão não conta', () => {
    expect(situacao(praga, base(aplic('c', 'ins', '2026-10-30T12:00:00Z')), new Date('2026-11-05')).situacao).toBe('aberto')
    expect(situacao(praga, base(aplic('d', 'ins', '2026-11-02T12:00:00Z', 't2')), new Date('2026-11-05')).situacao).toBe('aberto')
  })
  it('classe vem da base de mercado quando o insumo não tem', () => {
    const doenca = { ...praga, tipo: 'Doença' }
    expect(situacao(doenca, base(aplic('e', 'sem', '2026-11-02T12:00:00Z')), new Date('2026-11-05')).produto).toBe('Fox Xpro')
  })
  it('pergunta "resolveu?" depois de 14 dias e "não resolveu" reabre', () => {
    const b = base(aplic('f', 'ins', '2026-11-02T12:00:00Z'))
    expect(situacao(praga, b, new Date('2026-11-17T12:00:00Z')).situacao).toBe('perguntar')
    expect(situacao({ ...praga, reaberto_em: '2026-11-17T12:00:00Z' }, b, new Date('2026-11-18')).situacao).toBe('aberto')
  })
  it('cor: alta aberta é crítico; em tratamento não pesa', () => {
    const P = (g: Campo['gravidade'], s: Problema['situacao']) => ({ c: { ...praga, gravidade: g }, situacao: s }) as Problema
    expect(corDosProblemas([P('Alta', 'aberto')])).toBe('critico')
    expect(corDosProblemas([P('Alta', 'em-tratamento')])).toBe('bom')
  })
})
