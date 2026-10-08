import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useDados } from '../lib/hooks'
import { resumoTalhao, type Resumo } from '../lib/painel'
import { grupoSafra, listaSafras } from '../lib/safra'
import { contornoParaPontos, type Ponto } from '../lib/geo'
import { fmtN } from '../lib/formato'
import { Aviso } from '../components/ui'
import { Estadio } from './Talhao'

const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const COR = { bom: '#3f9a4a', atencao: '#e0a526', critico: '#d6452f', 'sem-dados': '#8a8270' } as const
const ROTULO = { bom: 'Em dia', atencao: 'Atenção', critico: 'Crítico', 'sem-dados': 'Sem safra' } as const
const ORDEM = { critico: 0, atencao: 1, bom: 2, 'sem-dados': 3 } as const

function lerSafra(): string | null { try { return localStorage.getItem('fdm-safra') } catch { return null } }
function gravarSafra(s: string) { try { localStorage.setItem('fdm-safra', s) } catch { /* sem armazenamento */ } }

/** A safra como conjunto: mapa com a cor de cada talhão e a lista com o ponto de atenção de cada um. */
export function Safra({ abrirTalhao, ir }: { abrirTalhao: (id: string) => void; ir: (tela: string) => void }) {
  const d = useDados()
  const safras = useMemo(() => (d ? listaSafras(d.ciclos) : []), [d])
  const [escolhida, setEscolhida] = useState<string | null>(lerSafra)
  const atual = safras.find((s) => s.nome === escolhida)?.nome ?? safras[0]?.nome ?? null

  const resumos = useMemo(() => (d ? d.talhoes.map((t) => resumoTalhao(t, d)) : []), [d])
  // Talhões da safra: os que têm ciclo nesse conjunto (a safra atual de cada talhão).
  const daSafra = useMemo(() => {
    if (!d || !atual) return [] as Resumo[]
    return d.talhoes.flatMap((t) => {
      const c = d.ciclos.filter((x) => x.talhao_id === t.id && grupoSafra(x) === atual)
        .sort((a, b) => (b.data_plantio ?? '').localeCompare(a.data_plantio ?? ''))[0]
      if (!c) return []
      const r = resumos.find((x) => x.talhao.id === t.id)!
      return [r.ciclo?.id === c.id ? r : resumoTalhao(t, { ...d, ciclos: d.ciclos.filter((x) => x.talhao_id !== t.id || x.id === c.id) })]
    }).sort((a, b) => ORDEM[a.estado.nivel] - ORDEM[b.estado.nivel] || a.talhao.nome.localeCompare(b.talhao.nome, 'pt-BR', { numeric: true }))
  }, [d, atual, resumos])

  if (!d) return <p className="vazio">Carregando…</p>
  const area = daSafra.reduce((s, r) => s + Number(r.talhao.area_ha), 0)
  const porCultura = new Map<string, number>()
  for (const r of daSafra) porCultura.set(r.ciclo!.cultura, (porCultura.get(r.ciclo!.cultura) ?? 0) + Number(r.talhao.area_ha))
  const conta = (n: keyof typeof COR) => daSafra.filter((r) => r.estado.nivel === n).length

  return (
    <div className="tela tela-safra">
      <h1>{atual ?? 'Safra'}</h1>
      {safras.length > 1 && (
        <div className="filtro-safras" role="tablist" aria-label="Safra">
          {safras.map((s) => (
            <button key={s.nome} role="tab" aria-selected={s.nome === atual} className={s.nome === atual ? 'on' : ''}
              onClick={() => { setEscolhida(s.nome); gravarSafra(s.nome) }}>
              {s.nome}{s.ativa ? '' : ' · encerrada'}
            </button>
          ))}
        </div>
      )}
      {!atual ? (
        <Aviso>Nenhuma safra ainda. Ela começa sozinha quando o Plantio é registrado em um talhão (Registrar › Operação).</Aviso>
      ) : (
        <>
          <p className="mudo resumo-safra">
            {daSafra.length} talhões · {fmtN(area, 1)} ha{porCultura.size > 1 || atual.startsWith('Safrinha') ? ' · ' + [...porCultura].map(([c, ha]) => `${c} ${fmtN(ha, 1)} ha`).join(' · ') : ''}
          </p>
          <div className="contagem-cores">
            <span className="selo critico">{conta('critico')} crítico</span>
            <span className="selo atencao">{conta('atencao')} atenção</span>
            <span className="selo bom">{conta('bom')} em dia</span>
          </div>
          <MapaSafra resumos={daSafra} talhoes={d.talhoes} abrir={abrirTalhao} />
          <ul className="lista-safra">
            {daSafra.map((r) => (
              <li key={r.talhao.id}>
                <button onClick={() => abrirTalhao(r.talhao.id)} className={`linha-talhao ${r.estado.nivel}`}>
                  <span className="cor" style={{ background: COR[r.estado.nivel] }} aria-hidden />
                  <span className="txt">
                    <b>{r.talhao.nome}</b> <span className="mudo">{fmtN(Number(r.talhao.area_ha), 1)} ha · {r.ciclo!.cultura}{r.ciclo!.cultivar ? ` ${r.ciclo!.cultivar}` : ''}</span>
                    {r.estadio && r.ciclo!.status === 'Em andamento' && <Estadio e={r.estadio} curto />}
                    <small className={`agora ${r.estado.nivel}`}>{r.estado.agora ?? (r.ciclo!.status === 'Colhido' ? 'Colhido.' : 'Nada pendente agora.')}</small>
                  </span>
                  <span className={`selo ${r.estado.nivel}`}>{ROTULO[r.estado.nivel]}</span>
                </button>
              </li>
            ))}
          </ul>
          {d.talhoes.length > daSafra.length && (
            <p className="mudo">{d.talhoes.length - daSafra.length} talhão(ões) fora desta safra. <button className="link" onClick={() => ir('mapa')}>Ver todos no mapa</button></p>
          )}
        </>
      )}
    </div>
  )
}

function MapaSafra({ resumos, talhoes, abrir }: { resumos: Resumo[]; talhoes: Resumo['talhao'][]; abrir: (id: string) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const abrirRef = useRef(abrir)
  abrirRef.current = abrir

  useEffect(() => {
    if (!caixa.current || mapa.current) return
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: false }).setView([-19.9, -48.83], 12)
    L.tileLayer(SATELITE, { maxZoom: 19 }).addTo(m)
    L.control.zoom({ position: 'topleft' }).addTo(m)
    camada.current = L.layerGroup().addTo(m)
    mapa.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(caixa.current)
    return () => { ro.disconnect(); m.remove(); mapa.current = null }
  }, [])

  useEffect(() => {
    const m = mapa.current, g = camada.current
    if (!m || !g) return
    g.clearLayers()
    const todos: Ponto[] = []
    const naSafra = new Map(resumos.map((r) => [r.talhao.id, r]))
    for (const t of talhoes) {
      const pts = contornoParaPontos(t.contorno)
      if (pts.length < 3) continue
      const r = naSafra.get(t.id)
      const cor = r ? COR[r.estado.nivel] : '#8a8270'
      const poli = L.polygon(pts, {
        color: r ? '#ffffff' : 'rgba(255,255,255,0.5)', weight: r ? 2 : 1, dashArray: r ? undefined : '4 4',
        fillColor: cor, fillOpacity: r ? 0.55 : 0.12,
      })
      poli.bindTooltip(`<b>${t.nome}</b><span>${r ? ROTULO[r.estado.nivel] : 'fora da safra'}</span>`, { permanent: true, direction: 'center', className: 'rotulo-talhao' })
      poli.on('click', () => abrirRef.current(t.id))
      poli.addTo(g)
      todos.push(...pts)
    }
    if (todos.length) m.fitBounds(L.latLngBounds(todos), { padding: [24, 24], maxZoom: 16 })
  }, [resumos, talhoes])

  return <div ref={caixa} className="mapa-safra" role="application" aria-label="Mapa dos talhões coloridos pelo estado" />
}
