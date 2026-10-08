import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { contornoParaPontos, type Ponto } from '../lib/geo'
import type { Talhao } from '../lib/tipos'

const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/** Mapa pequeno para marcar onde está o problema: começa no GPS; um toque muda o ponto. */
export function MapaPonto({ talhao, ponto, muda }: { talhao?: Talhao; ponto: Ponto | null; muda: (p: Ponto) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const mudaRef = useRef(muda)
  mudaRef.current = muda

  useEffect(() => {
    if (!caixa.current || mapa.current) return
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: false }).setView([-19.9, -48.83], 13)
    L.tileLayer(SATELITE, { maxZoom: 19 }).addTo(m)
    camada.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => mudaRef.current([e.latlng.lat, e.latlng.lng]))
    mapa.current = m
    return () => { m.remove(); mapa.current = null }
  }, [])

  // Contorno do talhão: enquadra quando muda de talhão.
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    const pts = contornoParaPontos(talhao?.contorno)
    if (pts.length >= 3) m.fitBounds(L.latLngBounds(pts), { padding: [12, 12] })
    else if (ponto) m.setView(ponto, 16)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talhao?.id])

  useEffect(() => {
    const g = camada.current
    if (!g) return
    g.clearLayers()
    const pts = contornoParaPontos(talhao?.contorno)
    if (pts.length >= 3) L.polygon(pts, { color: '#ffffff', weight: 2, fillOpacity: 0.12, interactive: false }).addTo(g)
    if (ponto) L.circleMarker(ponto, { radius: 9, color: '#ffffff', weight: 3, fillColor: '#e5533d', fillOpacity: 1 }).addTo(g)
  }, [talhao, ponto])

  return <div ref={caixa} className="mapa-ponto" role="application" aria-label="Toque no mapa para marcar o ponto do problema" />
}
