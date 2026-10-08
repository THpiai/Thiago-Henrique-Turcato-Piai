import L from 'leaflet'
import { pontoMedio, type Ponto } from './geo'

/**
 * Editor de contorno no estilo SmartFarm: pontos arrastáveis, "+" no meio de cada lado para
 * inserir ponto, toque no ponto para selecionar (e apagar). Só desenha; quem guarda o estado é a tela.
 */
export class EditorContorno {
  private grupo: L.LayerGroup
  private poli: L.Polygon | L.Polyline | null = null
  private pts: Ponto[] = []

  constructor(
    private mapa: L.Map,
    private aoMudar: (pts: Ponto[]) => void,
    private aoSelecionar: (i: number | null) => void,
  ) {
    this.grupo = L.layerGroup().addTo(mapa)
  }

  destruir() { this.grupo.remove() }

  desenhar(pts: Ponto[], sel: number | null) {
    this.pts = pts
    this.grupo.clearLayers()
    this.poli = null
    if (!pts.length) return
    const estilo = { color: '#f4d35e', weight: 2.5, fillColor: '#f4d35e', fillOpacity: 0.18, interactive: false }
    this.poli = (pts.length >= 3 ? L.polygon(pts, estilo) : L.polyline(pts, estilo)).addTo(this.grupo)

    // "+" no meio de cada lado: toque ou arraste para criar um ponto ali.
    const lados = pts.length >= 3 ? pts.length : pts.length - 1
    for (let i = 0; i < lados; i++) {
      const m = L.marker(pontoMedio(pts[i], pts[(i + 1) % pts.length]), {
        icon: L.divIcon({ className: 'vertice-meio', html: '<span>+</span>', iconSize: [34, 34] }),
        draggable: true, keyboard: false, zIndexOffset: 500,
      })
      const inserir = (ll: L.LatLng) => {
        const novo = [...pts]
        novo.splice(i + 1, 0, [ll.lat, ll.lng])
        this.aoMudar(novo)
        this.aoSelecionar(i + 1)
      }
      m.on('click', (e) => { L.DomEvent.stop(e); inserir(m.getLatLng()) })
      m.on('drag', () => this.preVisualizar(i + 1, m.getLatLng(), true))
      m.on('dragend', () => inserir(m.getLatLng()))
      m.addTo(this.grupo)
    }

    // Pontos: arraste para mover, toque para selecionar.
    pts.forEach((p, i) => {
      const m = L.marker(p, {
        icon: L.divIcon({ className: i === sel ? 'vertice sel' : 'vertice', html: `<span>${i + 1}</span>`, iconSize: [38, 38] }),
        draggable: true, keyboard: false, zIndexOffset: 1000,
      })
      m.on('click', (e) => { L.DomEvent.stop(e); this.aoSelecionar(i === sel ? null : i) })
      m.on('drag', () => this.preVisualizar(i, m.getLatLng(), false))
      m.on('dragend', () => {
        const ll = m.getLatLng()
        this.aoMudar(pts.map((q, j) => (j === i ? [ll.lat, ll.lng] : q)))
        this.aoSelecionar(i)
      })
      m.addTo(this.grupo)
    })
  }

  /** Atualiza só a linha durante o arraste, sem redesenhar tudo (fica leve no celular). */
  private preVisualizar(i: number, ll: L.LatLng, inserindo: boolean) {
    if (!this.poli) return
    const novo: Ponto[] = [...this.pts]
    if (inserindo) novo.splice(i, 0, [ll.lat, ll.lng])
    else novo[i] = [ll.lat, ll.lng]
    this.poli.setLatLngs(novo)
  }

  enquadrar() {
    if (this.pts.length >= 2) enquadrarLivre(this.mapa, this.pts)
  }
}

/** Enquadra os pontos deixando livre a área coberta pelo painel (lateral no computador, embaixo no celular). */
export function enquadrarLivre(mapa: L.Map, pts: Ponto[]) {
  const largo = window.innerWidth >= 1024
  const painel = document.querySelector('.painel-mapa') as HTMLElement | null
  const h = painel?.offsetHeight ?? 260
  mapa.fitBounds(L.latLngBounds(pts), {
    paddingTopLeft: [40, 50],
    paddingBottomRight: largo ? [420, 40] : [40, h + 30],
    maxZoom: 18,
  })
}
