// Geometria simples para talhões (escala de fazenda: projeção local em metros é suficiente).
export type Ponto = [number, number] // [lat, lng]

const R = 6371008.8
const rad = (g: number) => (g * Math.PI) / 180

function projetar(pts: Ponto[]): [number, number][] {
  const lat0 = rad(pts.reduce((s, p) => s + p[0], 0) / pts.length)
  return pts.map(([la, lo]) => [R * rad(lo) * Math.cos(lat0), R * rad(la)])
}

export function areaHa(pts: Ponto[]): number {
  if (pts.length < 3) return 0
  const xy = projetar(pts)
  let s = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2 / 10000
}

export function centro(pts: Ponto[]): Ponto {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}

export function dentro(p: Ponto, poli: Ponto[]): boolean {
  let ok = false
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [yi, xi] = poli[i], [yj, xj] = poli[j]
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) ok = !ok
  }
  return ok
}

export function distanciaM(a: Ponto, b: Ponto): number {
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1])
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type TalhaoGeo = { id: string; contorno?: { type: 'Polygon'; coordinates: number[][][] } | null; latitude?: number | null; longitude?: number | null }

export const contornoParaPontos = (c: TalhaoGeo['contorno']): Ponto[] =>
  c?.coordinates?.[0]?.map(([lng, lat]) => [lat, lng] as Ponto).slice(0, -1) ?? []

export const pontosParaContorno = (pts: Ponto[]) => ({
  type: 'Polygon' as const,
  coordinates: [[...pts, pts[0]].map(([lat, lng]) => [lng, lat])],
})

/** Talhão onde a pessoa está: dentro do contorno; senão o centro mais próximo até 1,5 km. */
export function talhaoDoPonto(p: Ponto, talhoes: TalhaoGeo[]): string | null {
  for (const t of talhoes) {
    const pts = contornoParaPontos(t.contorno)
    if (pts.length >= 3 && dentro(p, pts)) return t.id
  }
  let melhor: string | null = null, dmin = 1500
  for (const t of talhoes) {
    if (t.latitude == null || t.longitude == null) continue
    const d = distanciaM(p, [Number(t.latitude), Number(t.longitude)])
    if (d < dmin) { dmin = d; melhor = t.id }
  }
  return melhor
}
