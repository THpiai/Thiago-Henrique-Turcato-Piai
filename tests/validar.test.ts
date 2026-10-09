import { describe, expect, it } from 'vitest'
import { checar, ErroValidacao, problema } from '../src/lib/validar'

const agora = Date.parse('2026-10-09T12:00:00Z')

describe('validação dos formulários', () => {
  it('aceita registro normal', () => {
    expect(problema('chuva', { milimetros: 32.5, data: '2026-10-08' }, agora)).toBeNull()
    expect(problema('operacoes', { data_hora: '2026-10-09T10:00:00Z', area_ha: 42, vento_kmh: 8, umidade_pct: 70 }, agora)).toBeNull()
  })
  it('recusa número fora da faixa', () => {
    expect(problema('chuva', { milimetros: 900, data: '2026-10-08' }, agora)).toMatch(/Chuva/)
    expect(problema('operacoes', { umidade_pct: 140 }, agora)).toMatch(/Umidade/)
    expect(problema('estoque_mov', { quantidade: -3 }, agora)).toMatch(/Quantidade/)
    expect(problema('talhoes', { nome: 'T1', area_ha: 0 }, agora)).toMatch(/Área/)
  })
  it('recusa data no futuro ou antiga demais', () => {
    expect(problema('campo', { data_hora: '2026-12-01T10:00:00Z' }, agora)).toMatch(/futuro/)
    expect(problema('chuva', { milimetros: 1, data: '2009-01-01' }, agora)).toMatch(/antiga/)
  })
  it('recusa texto gigante e obrigatório vazio', () => {
    expect(problema('campo', { descricao: 'x'.repeat(2001) }, agora)).toMatch(/longo/)
    expect(problema('insumos', { nome: '   ' }, agora)).toMatch(/Preencha/)
    expect(problema('estoque_mov', { quantidade: null }, agora)).toMatch(/Preencha/)
  })
  it('alteração parcial só confere o que mudou', () => {
    expect(problema('campo', { status: 'Resolvida', resolvido_em: '2026-10-09T12:00:00Z' }, agora)).toBeNull()
  })
  it('checar interrompe com ErroValidacao', () => {
    expect(() => checar('chuva', [{ milimetros: -1, data: '2026-10-08' }])).toThrow(ErroValidacao)
  })
})
