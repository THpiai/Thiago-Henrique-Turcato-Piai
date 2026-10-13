import { describe, expect, it } from 'vitest'
import { casaBusca, gruposDeTalhoes, naSelecao, normalizar } from '../src/lib/filtro'
import type { Resumo } from '../src/lib/painel'

const r = (id: string, nivel: string, cultura?: string, lat = -19.83): Resumo =>
  ({ talhao: { id, nome: id, area_ha: 10, latitude: lat, longitude: -48.85 }, ciclo: cultura ? { cultura, status: 'Em andamento' } : undefined, estado: { nivel } }) as unknown as Resumo
const sedes = [{ id: 'a', nome: 'Flor da Mata', latitude: -19.831513, longitude: -48.855723 }, { id: 'b', nome: 'Carlim', latitude: -19.984539, longitude: -48.802805 }]

describe('filtro de talhões', () => {
  it('marcar todos ou nenhum volta para "todos"; ids sumidos saem', () => {
    expect(normalizar(['T1', 'T2'], ['T1', 'T2'])).toBeNull()
    expect(normalizar([], ['T1', 'T2'])).toBeNull()
    expect(normalizar(['T2', 'X'], ['T1', 'T2'])).toEqual(['T2'])
    expect(naSelecao(null, 'T9')).toBe(true)
    expect(naSelecao(['T1'], 'T9')).toBe(false)
  })
  it('atalhos por sede, cultura e situação', () => {
    const g = gruposDeTalhoes([r('T1', 'critico', 'Soja'), r('T2', 'atencao', 'Soja', -19.98), r('T3', 'bom')], { sedes })
    const ach = (tipo: string, nome: string) => g.find((x) => x.tipo === tipo && x.nome === nome)?.ids
    expect(ach('Sede', 'Carlim')).toEqual(['T2'])
    expect(ach('Sede', 'Flor da Mata')).toEqual(['T1', 'T3'])
    expect(ach('Cultura', 'Soja')).toEqual(['T1', 'T2'])
    expect(ach('Cultura', 'Sem lavoura')).toEqual(['T3'])
    expect(ach('Situação', 'Crítico')).toEqual(['T1'])
    expect(ach('Situação', 'Crítico + atenção')).toEqual(['T1', 'T2'])
  })
  it('busca ignora acento e maiúsculas', () => {
    expect(casaBusca('Talhão Café 3', 'cafe')).toBe(true)
    expect(casaBusca('T10', 't1')).toBe(true)
    expect(casaBusca('T2', 't1')).toBe(false)
  })
})
