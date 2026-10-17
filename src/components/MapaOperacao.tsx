import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Talhao } from '../lib/tipos'
import type { SituacaoMapa } from '../lib/operacoes'
import { contornoParaPontos, type Ponto } from '../lib/geo'

const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const COR_SITUACAO: Record<SituacaoMapa, string> = { feito: '#3f9a4a', andamento: '#e0a526', falta: '#c9c1ad', fora: '#8a8270' }
export const ROTULO_SITUACAO: Record<SituacaoMapa, string> = { feito: 'Feito', andamento: 'Em andamento', falta: 'Falta fazer', fora: 'Fora da safra' }

/**
 * Mapa que acompanha o formulário de Operação: os talhões marcados acendem, tocar num talhão
 * marca ou desmarca, e a cor mostra o andamento daquele tipo de operação na safra.
 */
export function MapaOperacao({ talhoes, marcados, situacao, alterna, tipo }: {
  talhoes: Talhao[]; marcados: string[]; situacao: Map<string, SituacaoMapa> | null; alterna: (id: string) => void; tipo: string
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const enquadrou = useRef(false)
  const alternaRef = useRef(alterna)
  alternaRef.current = alterna
  const [aberto, setAberto] = useState(() => { try { return localStorage.getItem('piai-mapa-operacao') !== '0' } catch { return true } })

  useEffect(() => {
    if (!aberto || !caixa.current || mapa.current) return
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: false }).setView([-19.9, -48.83], 12)
    L.tileLayer(SATELITE, { maxZoom: 19 }).addTo(m)
    L.control.zoom({ position: 'topleft' }).addTo(m)
    camada.current = L.layerGroup().addTo(m)
    mapa.current = m
    enquadrou.current = false
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(caixa.current)
    return () => { ro.disconnect(); m.remove(); mapa.current = null; camada.current = null }
  }, [aberto])

  useEffect(() => {
    const m = mapa.current, g = camada.current
    if (!m || !g) return
    g.clearLayers()
    const sel = new Set(marcados)
    const todos: Ponto[] = [], dosMarcados: Ponto[] = []
    for (const t of talhoes) {
      const pts = contornoParaPontos(t.contorno)
      if (pts.length < 3) continue
      const s = situacao?.get(t.id) ?? 'fora'
      const on = sel.has(t.id)
      const poli = L.polygon(pts, {
        color: on ? '#ffffff' : s === 'fora' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.8)',
        weight: on ? 4 : 1.5, dashArray: s === 'fora' && !on ? '4 4' : undefined,
        fillColor: situacao ? COR_SITUACAO[s] : on ? '#6b7a3a' : '#8a8270',
        fillOpacity: on ? 0.7 : s === 'fora' ? 0.12 : 0.45,
        className: on ? 'talhao-marcado' : undefined,
      })
      const legenda = situacao ? ROTULO_SITUACAO[s] : on ? 'marcado' : ''
      poli.bindTooltip(`<b>${on ? '✓ ' : ''}${t.nome}</b>${legenda ? `<span>${legenda}</span>` : ''}`, { permanent: true, direction: 'center', className: 'rotulo-talhao' })
      poli.on('click', () => alternaRef.current(t.id))
      poli.addTo(g)
      todos.push(...pts)
      if (on) dosMarcados.push(...pts)
    }
    if (!enquadrou.current && todos.length) {
      m.fitBounds(L.latLngBounds(todos), { padding: [20, 20], maxZoom: 16 })
      enquadrou.current = true
    }
  }, [talhoes, marcados, situacao, aberto])

  const semDesenho = talhoes.filter((t) => contornoParaPontos(t.contorno).length < 3).length
  const conta = (s: SituacaoMapa) => (situacao ? [...situacao.values()].filter((x) => x === s).length : 0)
  const muda = () => {
    const v = !aberto
    setAberto(v)
    try { localStorage.setItem('piai-mapa-operacao', v ? '1' : '0') } catch { /* sem armazenamento */ }
  }

  return (
    <aside className={aberto ? 'mapa-operacao aberto' : 'mapa-operacao'}>
      <button type="button" className="mapa-operacao-topo" onClick={muda} aria-expanded={aberto}>
        <b>Mapa</b>
        {situacao && tipo ? <span className="mudo">{tipo}: {conta('feito')} feito · {conta('andamento')} em andamento · {conta('falta')} falta</span>
          : <span className="mudo">{marcados.length} marcado(s). Toque no talhão para marcar</span>}
        <span className="seta-abre" aria-hidden>{aberto ? '▴' : '▾'}</span>
      </button>
      {aberto && (
        <>
          <div ref={caixa} className="mapa-op" role="application" aria-label="Mapa dos talhões: toque para marcar" />
          {situacao && (
            <div className="legenda-mapa">
              {(['feito', 'andamento', 'falta'] as const).map((s) => <span key={s}><i style={{ background: COR_SITUACAO[s] }} />{ROTULO_SITUACAO[s]}</span>)}
              <span><i className="marcado" />Marcado agora</span>
            </div>
          )}
          {semDesenho > 0 && <small className="mudo">{semDesenho} talhão(ões) sem desenho não aparecem no mapa.</small>}
        </>
      )}
    </aside>
  )
}
