import { describe, expect, it } from 'vitest'
import { areaHa, contornoParaPontos, dentro, pontosParaContorno, talhaoDoPonto, type Ponto } from '../src/lib/geo'

// Quadrado de ~1 km x ~1 km perto de Rio Verde (GO).
const lat = -17.8, lng = -50.9
const dLat = 1000 / 111_320, dLng = 1000 / (111_320 * Math.cos((lat * Math.PI) / 180))
const quadrado: Ponto[] = [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]]

describe('geo', () => {
  it('mede a área em hectares', () => expect(areaHa(quadrado)).toBeCloseTo(100, 0))
  it('sabe se o ponto está dentro', () => {
    expect(dentro([lat + dLat / 2, lng + dLng / 2], quadrado)).toBe(true)
    expect(dentro([lat - dLat, lng], quadrado)).toBe(false)
  })
  it('ida e volta GeoJSON', () => expect(contornoParaPontos(pontosParaContorno(quadrado))).toEqual(quadrado))
  it('acha o talhão pelo GPS, com folga pelo centro', () => {
    const ts = [
      { id: 'a', contorno: pontosParaContorno(quadrado) },
      { id: 'b', contorno: null, latitude: lat + 3 * dLat, longitude: lng },
    ]
    expect(talhaoDoPonto([lat + dLat / 2, lng + dLng / 2], ts)).toBe('a')
    expect(talhaoDoPonto([lat + 2.8 * dLat, lng], ts)).toBe('b')
    expect(talhaoDoPonto([lat + 10 * dLat, lng], ts)).toBeNull()
  })
})
