import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useDados, useGps, useSessao } from '../lib/hooks'
import { areaHa, centro, contornoParaPontos, distanciaM, pontosParaContorno, type Ponto } from '../lib/geo'
import { cicloAtual } from '../lib/painel'
import { HEX_CULTURA } from '../lib/opcoes'
import { fmtN, uuid } from '../lib/formato'
import { salvar } from '../lib/sync'
import { Aviso, Rotulo } from '../components/ui'
import type { Talhao } from '../lib/tipos'

const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export function Mapa({ abrirTalhao }: { abrirTalhao: (id: string) => void }) {
  const d = useDados()
  const { gestor } = useSessao()
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const rascunho = useRef<L.LayerGroup | null>(null)
  const eu = useRef<L.CircleMarker | null>(null)
  const enquadrado = useRef(false)
  const [desenho, setDesenho] = useState<{ pts: Ponto[]; editando?: Talhao } | null>(null)
  const [andando, setAndando] = useState(false)
  const [finalizar, setFinalizar] = useState(false)
  const { pos } = useGps()

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!caixa.current || mapa.current) return
    const m = L.map(caixa.current, { zoomControl: true, attributionControl: false }).setView([-15.8, -47.9], 5)
    L.tileLayer(SATELITE, { maxZoom: 19 }).addTo(m)
    camada.current = L.layerGroup().addTo(m)
    rascunho.current = L.layerGroup().addTo(m)
    mapa.current = m
    return () => { m.remove(); mapa.current = null }
  }, [])

  // Talhões desenhados, coloridos pela cultura.
  useEffect(() => {
    const m = mapa.current, g = camada.current
    if (!m || !g || !d) return
    g.clearLayers()
    const limites = L.latLngBounds([])
    for (const t of d.talhoes) {
      const pts = contornoParaPontos(t.contorno)
      if (pts.length < 3) continue
      const c = cicloAtual(t.id, d.ciclos)
      const cor = HEX_CULTURA[c?.cultura ?? 'Pousio'] ?? '#8a8270'
      const alerta = d.campo.some((x) => x.talhao_id === t.id && x.status === 'Aplicação indicada')
      const poli = L.polygon(pts, { color: alerta ? '#d23b2a' : '#fff', weight: alerta ? 3 : 1.5, fillColor: cor, fillOpacity: 0.45 })
      poli.bindTooltip(`${t.nome}<br>${c?.cultura ?? 'Sem safra'}`, { permanent: true, direction: 'center', className: 'rotulo-talhao' })
      poli.on('click', () => { if (!desenhoRef.current) abrirTalhao(t.id) })
      poli.addTo(g)
      limites.extend(poli.getBounds())
    }
    if (limites.isValid() && !enquadrado.current) { m.fitBounds(limites, { padding: [20, 20] }); enquadrado.current = true }
  }, [d, abrirTalhao])

  // Ponto azul do GPS; sem talhões, centraliza em você.
  useEffect(() => {
    const m = mapa.current
    if (!m || !pos) return
    if (!eu.current) eu.current = L.circleMarker(pos.p, { radius: 7, color: '#fff', weight: 2, fillColor: '#2a7de1', fillOpacity: 1 }).addTo(m)
    else eu.current.setLatLng(pos.p)
    if (!enquadrado.current) { m.setView(pos.p, 15); enquadrado.current = true }
  }, [pos])

  // Desenho: tocar no mapa acrescenta um vértice.
  const desenhoRef = useRef(desenho)
  desenhoRef.current = desenho
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    const toque = (e: L.LeafletMouseEvent) => {
      if (desenhoRef.current && !andando) setDesenho({ ...desenhoRef.current, pts: [...desenhoRef.current.pts, [e.latlng.lat, e.latlng.lng]] })
    }
    m.on('click', toque)
    return () => { m.off('click', toque) }
  }, [andando])

  // Andando com o GPS: um vértice a cada 10 m percorridos.
  useEffect(() => {
    if (!andando || !pos || !desenhoRef.current) return
    if (pos.precisao > 25) return
    const pts = desenhoRef.current.pts
    if (!pts.length || distanciaM(pts[pts.length - 1], pos.p) >= 10) setDesenho({ ...desenhoRef.current, pts: [...pts, pos.p] })
  }, [pos, andando])

  useEffect(() => {
    const g = rascunho.current
    if (!g) return
    g.clearLayers()
    if (!desenho?.pts.length) return
    if (desenho.pts.length >= 3) L.polygon(desenho.pts, { color: '#ffd23f', weight: 2, dashArray: '6 4', fillOpacity: 0.2 }).addTo(g)
    else L.polyline(desenho.pts, { color: '#ffd23f', weight: 2 }).addTo(g)
    desenho.pts.forEach((p) => L.circleMarker(p, { radius: 4, color: '#ffd23f', fillOpacity: 1 }).addTo(g))
  }, [desenho])

  const area = desenho ? areaHa(desenho.pts) : 0
  const semContorno = d?.talhoes.filter((t) => contornoParaPontos(t.contorno).length < 3) ?? []

  return (
    <div className="tela-mapa">
      <div ref={caixa} className="mapa" data-testid="mapa" />
      <div className="painel-mapa">
        {!desenho && (
          <>
            <div className="legenda">
              {Object.entries(HEX_CULTURA).map(([c, cor]) => <span key={c}><i style={{ background: cor }} />{c}</span>)}
            </div>
            {gestor && <button className="primario" onClick={() => setDesenho({ pts: [] })}>+ Desenhar talhão</button>}
            {gestor && semContorno.length > 0 && (
              <small className="mudo">Sem desenho: {semContorno.map((t) => (
                <button key={t.id} className="link" onClick={() => setDesenho({ pts: [], editando: t })}>{t.nome}</button>
              ))}</small>
            )}
          </>
        )}
        {desenho && !finalizar && (
          <>
            <b>{desenho.editando ? `Redesenhando ${desenho.editando.nome}` : 'Novo talhão'}</b>
            <small>{andando ? 'Ande pela divisa do talhão. Um ponto é marcado a cada 10 m.' : 'Toque nos cantos do talhão, em volta.'}</small>
            <div className="acoes">
              <span className="area-ao-vivo">{desenho.pts.length} pontos · <b>{fmtN(area, 2)} ha</b></span>
              <button className={andando ? 'secundario on' : 'secundario'} onClick={() => setAndando(!andando)}>{andando ? '■ Parar GPS' : '🚶 Andar com GPS'}</button>
              <button className="secundario" disabled={!desenho.pts.length} onClick={() => setDesenho({ ...desenho, pts: desenho.pts.slice(0, -1) })}>Desfazer</button>
              <button className="secundario" onClick={() => { setDesenho(null); setAndando(false) }}>Cancelar</button>
              <button className="primario" disabled={desenho.pts.length < 3} onClick={() => { setAndando(false); setFinalizar(true) }}>Concluir</button>
            </div>
            {andando && pos && pos.precisao > 25 && <Aviso tipo="alerta">GPS impreciso ({fmtN(pos.precisao)} m). Aguarde melhorar.</Aviso>}
          </>
        )}
        {desenho && finalizar && (
          <FormTalhao pts={desenho.pts} editando={desenho.editando} fechar={() => { setFinalizar(false); setDesenho(null) }} />
        )}
      </div>
    </div>
  )
}

function FormTalhao({ pts, editando, fechar }: { pts: Ponto[]; editando?: Talhao; fechar: () => void }) {
  const calc = Math.round(areaHa(pts) * 100) / 100
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [area, setArea] = useState(String(editando?.area_ha ?? calc))
  const [pluv, setPluv] = useState(editando?.pluviometro ?? false)
  const [obs, setObs] = useState(editando?.observacao ?? '')
  async function gravar() {
    const [lat, lng] = centro(pts)
    await salvar('talhoes', [{
      id: editando?.id ?? uuid(), nome: nome.trim(), area_ha: Number(String(area).replace(',', '.')) || calc,
      contorno: pontosParaContorno(pts), latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6,
      pluviometro: pluv, ativo: true, observacao: obs || null,
    }])
    fechar()
  }
  return (
    <div className="form-talhao">
      <Rotulo t="Nome do talhão"><input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: T01 Sede" /></Rotulo>
      <Rotulo t="Área (ha)" dica={`Desenho mede ${fmtN(calc, 2)} ha. Ajuste se a área oficial for outra.`}>
        <input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
      </Rotulo>
      <label className="check"><input type="checkbox" checked={pluv} onChange={(e) => setPluv(e.target.checked)} /> Tem pluviômetro</label>
      <Rotulo t="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} /></Rotulo>
      <div className="acoes">
        <button className="secundario" onClick={fechar}>Cancelar</button>
        <button className="primario" disabled={!nome.trim()} onClick={() => void gravar()}>Salvar talhão</button>
      </div>
    </div>
  )
}
