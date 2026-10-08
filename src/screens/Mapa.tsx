import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useDados, useGps, useSessao } from '../lib/hooks'
import { areaHa, centro, contornoParaPontos, distanciaM, perimetroM, pontosParaContorno, type Ponto } from '../lib/geo'
import { EditorContorno, enquadrarLivre } from '../lib/editor'
import { cicloAtual } from '../lib/painel'
import { HEX_CULTURA } from '../lib/opcoes'
import { fmtN, uuid } from '../lib/formato'
import { salvar } from '../lib/sync'
import { Aviso, Rotulo } from '../components/ui'
import { Icone } from '../components/Icone'
import type { Talhao } from '../lib/tipos'

const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

type Edicao = { pts: Ponto[]; passado: Ponto[][]; futuro: Ponto[][]; sel: number | null; talhao?: Talhao }

export function Mapa({ abrirTalhao }: { abrirTalhao: (id: string) => void }) {
  const d = useDados()
  const { gestor } = useSessao()
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const editor = useRef<EditorContorno | null>(null)
  const eu = useRef<L.CircleMarker | null>(null)
  const enquadrado = useRef(false)
  const [ed, setEd] = useState<Edicao | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [andando, setAndando] = useState(false)
  const [finalizar, setFinalizar] = useState(false)
  const { pos } = useGps()
  const edRef = useRef(ed)
  edRef.current = ed

  // Toda mudança de pontos passa por aqui: guarda o passo anterior para desfazer.
  const mudar = useCallback((pts: Ponto[], sel?: number | null) => {
    setEd((e) => e && { ...e, pts, passado: [...e.passado, e.pts].slice(-100), futuro: [], sel: sel === undefined ? e.sel : sel })
  }, [])
  const selecionar = useCallback((i: number | null) => setEd((e) => e && { ...e, sel: i }), [])
  const desfazer = useCallback(() => setEd((e) => e && e.passado.length
    ? { ...e, pts: e.passado[e.passado.length - 1], passado: e.passado.slice(0, -1), futuro: [e.pts, ...e.futuro], sel: null } : e), [])
  const refazer = useCallback(() => setEd((e) => e && e.futuro.length
    ? { ...e, pts: e.futuro[0], futuro: e.futuro.slice(1), passado: [...e.passado, e.pts], sel: null } : e), [])
  const apagarPonto = useCallback(() => setEd((e) => e && e.sel != null
    ? { ...e, pts: e.pts.filter((_, i) => i !== e.sel), passado: [...e.passado, e.pts], futuro: [], sel: null } : e), [])
  const adicionar = useCallback((p: Ponto) => setEd((e) => {
    if (!e) return e
    const onde = e.sel != null ? e.sel + 1 : e.pts.length
    const pts = [...e.pts]
    pts.splice(onde, 0, p)
    return { ...e, pts, passado: [...e.passado, e.pts], futuro: [], sel: e.sel != null ? onde : null }
  }), [])

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!caixa.current || mapa.current) return
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: false }).setView([-19.9, -48.83], 12)
    L.tileLayer(SATELITE, { maxZoom: 19 }).addTo(m)
    L.control.zoom({ position: 'topleft' }).addTo(m)
    L.control.scale({ position: 'topright', imperial: false }).addTo(m)
    camada.current = L.layerGroup().addTo(m)
    mapa.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(caixa.current)
    return () => { ro.disconnect(); m.remove(); mapa.current = null }
  }, [])

  // Toque no mapa: no modo edição acrescenta ponto; fora dele, tira a seleção.
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    const toque = (e: L.LeafletMouseEvent) => {
      if (edRef.current && !andando) adicionar([e.latlng.lat, e.latlng.lng])
      else if (!edRef.current) setSelecionado(null)
    }
    m.on('click', toque)
    return () => { m.off('click', toque) }
  }, [andando, adicionar])

  // Talhões coloridos pela cultura.
  useEffect(() => {
    const m = mapa.current, g = camada.current
    if (!m || !g || !d) return
    g.clearLayers()
    const todos: Ponto[] = []
    for (const t of d.talhoes) {
      const pts = contornoParaPontos(t.contorno)
      if (pts.length < 3) continue
      const emEdicao = ed?.talhao?.id === t.id
      const c = cicloAtual(t.id, d.ciclos)
      const cor = HEX_CULTURA[c?.cultura ?? 'Pousio'] ?? '#8a8270'
      const alerta = d.campo.some((x) => x.talhao_id === t.id && x.status === 'Aplicação indicada')
      const sel = selecionado === t.id
      const poli = L.polygon(pts, {
        color: alerta ? '#e5533d' : sel ? '#ffffff' : 'rgba(255,255,255,0.75)', weight: sel || alerta ? 3 : 1.5,
        fillColor: cor, fillOpacity: emEdicao ? 0.05 : sel ? 0.6 : 0.42, opacity: emEdicao ? 0.3 : 1,
      })
      if (!emEdicao) poli.bindTooltip(`<b>${t.nome}</b><span>${fmtN(Number(t.area_ha), 1)} ha · ${c?.cultura ?? 'sem safra'}</span>`, { permanent: true, direction: 'center', className: 'rotulo-talhao' })
      poli.on('click', (e) => { if (!edRef.current) { L.DomEvent.stop(e); setSelecionado(t.id) } })
      poli.addTo(g)
      todos.push(...pts)
    }
    if (todos.length && !enquadrado.current) { enquadrarLivre(m, todos); enquadrado.current = true }
  }, [d, selecionado, ed?.talhao?.id])

  // Editor de pontos.
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    if (!ed) { editor.current?.destruir(); editor.current = null; return }
    if (!editor.current) editor.current = new EditorContorno(m, (pts) => mudar(pts), selecionar)
    editor.current.desenhar(ed.pts, ed.sel)
  }, [ed, mudar, selecionar])

  // Ponto azul do GPS.
  useEffect(() => {
    const m = mapa.current
    if (!m || !pos) return
    if (!eu.current) eu.current = L.circleMarker(pos.p, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#2a7de1', fillOpacity: 1 }).addTo(m)
    else eu.current.setLatLng(pos.p)
    if (!enquadrado.current) { m.setView(pos.p, 15); enquadrado.current = true }
  }, [pos])

  // Andando com o GPS: um ponto a cada 10 m.
  useEffect(() => {
    const e = edRef.current
    if (!andando || !pos || !e || pos.precisao > 25) return
    const ult = e.pts[e.pts.length - 1]
    if (!ult || distanciaM(ult, pos.p) >= 10) mudar([...e.pts, pos.p], null)
  }, [pos, andando, mudar])

  // Atalhos no computador.
  useEffect(() => {
    if (!ed || finalizar) return
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); desfazer() }
      else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); refazer() }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); apagarPonto() }
      else if (e.key === 'Escape') selecionar(null)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ed, finalizar, desfazer, refazer, apagarPonto, selecionar])

  function comecar(t?: Talhao) {
    const pts = t ? contornoParaPontos(t.contorno) : []
    setEd({ pts, passado: [], futuro: [], sel: null, talhao: t })
    setSelecionado(null)
    if (pts.length >= 3 && mapa.current) { const m = mapa.current; setTimeout(() => enquadrarLivre(m, pts), 50) }
  }
  const sair = () => { setEd(null); setAndando(false); setFinalizar(false) }

  const talhaoSel = d?.talhoes.find((t) => t.id === selecionado)
  const cicloSel = talhaoSel && d ? cicloAtual(talhaoSel.id, d.ciclos) : undefined
  const area = ed ? areaHa(ed.pts) : 0
  const resumoTalhoes = useMemo(() => d?.talhoes.map((t) => ({ t, c: cicloAtual(t.id, d.ciclos), desenhado: contornoParaPontos(t.contorno).length >= 3 })) ?? [], [d])

  return (
    <div className="tela-mapa">
      <div ref={caixa} className={ed && !andando ? 'mapa editando' : 'mapa'} data-testid="mapa" />

      <aside className="painel-mapa">
        {!ed && (
          <>
            {talhaoSel ? (
              <div className="ficha-talhao" style={{ ['--cor' as string]: HEX_CULTURA[cicloSel?.cultura ?? 'Pousio'] }}>
                <div className="topo">
                  <div><b className="titulo-talhao">{talhaoSel.nome}</b><small>{fmtN(Number(talhaoSel.area_ha), 2)} ha · {cicloSel ? `${cicloSel.cultura}${cicloSel.cultivar ? ' · ' + cicloSel.cultivar : ''}` : 'sem safra'}</small></div>
                  <button className="icone-btn" onClick={() => setSelecionado(null)} aria-label="Fechar"><Icone n="x" t={18} /></button>
                </div>
                <div className="acoes">
                  <button className="primario" onClick={() => abrirTalhao(talhaoSel.id)}>Ver talhão <Icone n="seta" t={18} /></button>
                  {gestor && <button className="secundario" onClick={() => comecar(talhaoSel)}><Icone n="lapis" t={18} /> Editar contorno</button>}
                </div>
              </div>
            ) : (
              <>
                <div className="cabeca-painel">
                  <b>Talhões</b>
                  {gestor && <button className="primario compacto" onClick={() => comecar()}><Icone n="registrar" t={18} /> Novo talhão</button>}
                </div>
                <ul className="lista-talhoes">
                  {resumoTalhoes.map(({ t, c, desenhado }) => (
                    <li key={t.id}>
                      <button onClick={() => (desenhado ? setSelecionado(t.id) : gestor && comecar(t))}>
                        <i style={{ background: HEX_CULTURA[c?.cultura ?? 'Pousio'] }} />
                        <span><b>{t.nome}</b><small>{c?.cultura ?? 'sem safra'}{desenhado ? '' : ' · sem desenho, toque para desenhar'}</small></span>
                        <span className="num">{fmtN(Number(t.area_ha), 1)} ha</span>
                      </button>
                    </li>
                  ))}
                  {!resumoTalhoes.length && <li className="mudo">Nenhum talhão ainda.{gestor ? ' Toque em "Novo talhão".' : ''}</li>}
                </ul>
                <div className="legenda">
                  {Object.entries(HEX_CULTURA).map(([c, cor]) => <span key={c}><i style={{ background: cor }} />{c}</span>)}
                </div>
              </>
            )}
          </>
        )}

        {ed && !finalizar && (
          <div className="editor">
            <div className="cabeca-painel">
              <b>{ed.talhao ? ed.talhao.nome : 'Novo talhão'}</b>
              <button className="icone-btn" onClick={sair} aria-label="Cancelar"><Icone n="x" t={18} /></button>
            </div>
            <div className="medidas">
              <div><b>{fmtN(area, 2)}</b><span>hectares</span></div>
              <div><b>{fmtN(perimetroM(ed.pts), 0)}</b><span>metros de divisa</span></div>
              <div><b>{ed.pts.length}</b><span>pontos</span></div>
            </div>
            <small className="dica-editor">
              {andando ? 'Ande pela divisa. Um ponto a cada 10 m.'
                : ed.sel != null ? `Ponto ${ed.sel + 1} selecionado: arraste para mover, apague, ou toque no mapa para inserir depois dele.`
                  : 'Toque no mapa para marcar. Arraste um ponto para mover. Toque no + entre dois pontos para inserir.'}
            </small>
            <div className="ferramentas">
              <button onClick={desfazer} disabled={!ed.passado.length} title="Desfazer (Ctrl+Z)"><Icone n="desfazer" /><span>Desfazer</span></button>
              <button onClick={refazer} disabled={!ed.futuro.length} title="Refazer (Ctrl+Y)"><Icone n="refazer" /><span>Refazer</span></button>
              <button onClick={apagarPonto} disabled={ed.sel == null} title="Apagar ponto (Delete)"><Icone n="lixo" /><span>Apagar</span></button>
              <button onClick={() => pos && adicionar(pos.p)} disabled={!pos} title="Marcar onde estou"><Icone n="alvo" /><span>Aqui</span></button>
              <button onClick={() => setAndando(!andando)} className={andando ? 'on' : ''} title="Andar a divisa com o GPS"><Icone n="andar" /><span>{andando ? 'Parar' : 'Andar'}</span></button>
              <button onClick={() => editor.current?.enquadrar()} disabled={ed.pts.length < 2} title="Enquadrar"><Icone n="enquadrar" /><span>Ver tudo</span></button>
            </div>
            {andando && pos && pos.precisao > 25 && <Aviso tipo="alerta">GPS impreciso ({fmtN(pos.precisao)} m). Aguarde melhorar.</Aviso>}
            <div className="acoes">
              <button className="secundario" onClick={sair}>Cancelar</button>
              <button className="primario" disabled={ed.pts.length < 3} onClick={() => { setAndando(false); setFinalizar(true) }}><Icone n="check" t={18} /> Concluir</button>
            </div>
          </div>
        )}
        {ed && finalizar && <FormTalhao pts={ed.pts} editando={ed.talhao} voltar={() => setFinalizar(false)} fechar={sair} />}
      </aside>
    </div>
  )
}

function FormTalhao({ pts, editando, voltar, fechar }: { pts: Ponto[]; editando?: Talhao; voltar: () => void; fechar: () => void }) {
  const calc = Math.round(areaHa(pts) * 100) / 100
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [area, setArea] = useState(String(editando ? calc : calc).replace('.', ','))
  const [pluv, setPluv] = useState(editando?.pluviometro ?? false)
  const [obs, setObs] = useState(editando?.observacao ?? '')
  async function gravar() {
    const [lat, lng] = centro(pts)
    await salvar('talhoes', [{
      id: editando?.id ?? uuid(), nome: nome.trim(), area_ha: Number(area.replace(',', '.')) || calc,
      contorno: pontosParaContorno(pts), latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6,
      pluviometro: pluv, ativo: true, observacao: obs || null,
    }])
    fechar()
  }
  return (
    <div className="form-talhao">
      <div className="cabeca-painel"><b>{editando ? 'Salvar contorno' : 'Novo talhão'}</b></div>
      <Rotulo t="Nome do talhão"><input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: T01 Sede" /></Rotulo>
      <Rotulo t="Área (ha)" dica={`O desenho mede ${fmtN(calc, 2)} ha${editando ? ` (antes: ${fmtN(Number(editando.area_ha), 2)} ha)` : ''}. Ajuste se a área oficial for outra.`}>
        <input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
      </Rotulo>
      <label className="check"><input type="checkbox" checked={pluv} onChange={(e) => setPluv(e.target.checked)} /> Tem pluviômetro</label>
      <Rotulo t="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} /></Rotulo>
      <div className="acoes">
        <button className="secundario" onClick={voltar}>Voltar aos pontos</button>
        <button className="primario" disabled={!nome.trim()} onClick={() => void gravar()}>Salvar talhão</button>
      </div>
    </div>
  )
}
