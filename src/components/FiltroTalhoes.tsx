import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dados, Resumo } from '../lib/painel'
import { casaBusca, gruposDeTalhoes, naSelecao, normalizar, useSelecao, type Grupo } from '../lib/filtro'
import { fmtN } from '../lib/formato'
import { Icone } from './Icone'

const TIPOS: Grupo['tipo'][] = ['Situação', 'Sede', 'Cultura']
const COR_NIVEL = { critico: '#d6452f', atencao: '#e0a526', bom: '#3f9a4a', 'sem-dados': '#8a8270' } as const

/** Aplica a seleção do filtro a uma lista de resumos (mesma seleção em todas as telas). */
export function useFiltrados(resumos: Resumo[]): Resumo[] {
  const [sel] = useSelecao()
  return useMemo(() => resumos.filter((r) => naSelecao(sel, r.talhao.id)), [resumos, sel])
}

/** Barra do filtro: mostra o recorte atual e abre o seletor de talhões. */
export function FiltroTalhoes({ resumos, d }: { resumos: Resumo[]; d: Pick<Dados, 'sedes'> }) {
  const [sel, setSel] = useSelecao()
  const [aberto, setAberto] = useState(false)
  const todos = useMemo(() => resumos.map((r) => r.talhao.id), [resumos])
  const aplicar = useCallback((ids: string[]) => setSel(normalizar(ids, todos)), [setSel, todos])
  const fechar = useCallback(() => setAberto(false), [])
  const marcados = resumos.filter((r) => naSelecao(sel, r.talhao.id))
  const filtrando = sel !== null && marcados.length < resumos.length
  if (!resumos.length) return null

  return (
    <div className={filtrando ? 'filtro-barra ativo' : 'filtro-barra'}>
      <button className="filtro-botao" onClick={() => setAberto(true)} aria-haspopup="dialog">
        <Icone n="filtro" t={18} />
        <span>{filtrando ? <><b>{marcados.length}</b> de {resumos.length} talhões</> : <>Todos os talhões <span className="mudo">({resumos.length})</span></>}</span>
      </button>
      {filtrando && (
        <>
          <span className="filtro-nomes">
            {marcados.slice(0, 4).map((r) => <span key={r.talhao.id} className="nome">{r.talhao.nome}</span>)}
            {marcados.length > 4 && <span className="nome mais">+{marcados.length - 4}</span>}
          </span>
          <button className="filtro-limpar" onClick={() => setSel(null)} aria-label="Limpar filtro e mostrar todos os talhões"><Icone n="x" t={16} />Limpar</button>
        </>
      )}
      {aberto && <Seletor resumos={resumos} d={d} sel={sel} muda={aplicar} fechar={fechar} />}
    </div>
  )
}

function Seletor({ resumos, d, sel, muda, fechar }: {
  resumos: Resumo[]; d: Pick<Dados, 'sedes'>; sel: string[] | null; muda: (ids: string[]) => void; fechar: () => void
}) {
  const [busca, setBusca] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  const grupos = useMemo(() => gruposDeTalhoes(resumos, d), [resumos, d])
  // Rascunho: dá para desmarcar tudo e ir marcando; vale ao fechar (vazio não muda nada).
  const [marcados, setMarcados] = useState(() => new Set(resumos.filter((r) => naSelecao(sel, r.talhao.id)).map((r) => r.talhao.id)))
  const rascunho = useRef(marcados)
  rascunho.current = marcados
  const concluir = useCallback(() => {
    if (rascunho.current.size) muda([...rascunho.current])
    fechar()
  }, [muda, fechar])
  const visiveis = busca ? resumos.filter((r) => casaBusca(r.talhao.nome, busca)) : resumos
  const area = resumos.filter((r) => marcados.has(r.talhao.id)).reduce((s, r) => s + Number(r.talhao.area_ha), 0)

  const concluirRef = useRef(concluir)
  concluirRef.current = concluir
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') concluirRef.current() }
    window.addEventListener('keydown', tecla)
    document.body.classList.add('sem-rolagem')
    caixa.current?.focus()
    return () => { window.removeEventListener('keydown', tecla); document.body.classList.remove('sem-rolagem') }
  }, [])

  const troca = (id: string) => {
    const n = new Set(marcados)
    if (n.has(id)) n.delete(id); else n.add(id)
    setMarcados(n)
  }
  // Atalho: um toque mostra só o grupo; tocar de novo no mesmo grupo volta para todos.
  const exato = (g: Grupo) => g.ids.length === marcados.size && g.ids.every((id) => marcados.has(id))
  const grupo = (g: Grupo) => setMarcados(new Set(exato(g) ? resumos.map((r) => r.talhao.id) : g.ids))
  const todosVisiveis = visiveis.every((r) => marcados.has(r.talhao.id))

  return (
    <div className="painel-fundo" onClick={concluir}>
      <div className="painel-filtro" role="dialog" aria-modal="true" aria-label="Escolher talhões" ref={caixa} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <b>Escolher talhões</b>
            <small>{marcados.size} de {resumos.length} · {fmtN(area, 1)} ha</small>
          </div>
          <button className="icone-btn" onClick={concluir} aria-label="Fechar"><Icone n="x" t={18} /></button>
        </header>

        <div className="painel-corpo">
          {TIPOS.map((tipo) => {
            const gs = grupos.filter((g) => g.tipo === tipo)
            if (!gs.length) return null
            return (
              <div key={tipo} className="atalhos">
                <small>{tipo}</small>
                <div>
                  {gs.map((g) => (
                    <button key={g.nome} className={exato(g) ? 'chip on' : 'chip'} aria-pressed={exato(g)} onClick={() => grupo(g)}>
                      {g.nome} <span className="conta">{g.ids.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          <label className="busca">
            <Icone n="lupa" t={18} />
            <input type="search" placeholder="Buscar talhão" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar talhão" />
          </label>

          <div className="marcar">
            <button className="link" onClick={() => {
              const n = new Set(marcados)
              for (const r of visiveis) { if (todosVisiveis) n.delete(r.talhao.id); else n.add(r.talhao.id) }
              setMarcados(n)
            }}>{todosVisiveis ? (busca ? 'Desmarcar encontrados' : 'Desmarcar todos') : (busca ? 'Marcar encontrados' : 'Marcar todos')}</button>
            {busca && <button className="link" onClick={() => setMarcados(new Set(visiveis.map((r) => r.talhao.id)))}>Só os encontrados</button>}
          </div>

          <ul className="lista-marcar">
            {visiveis.map((r) => (
              <li key={r.talhao.id}>
                <label>
                  <input type="checkbox" checked={marcados.has(r.talhao.id)} onChange={() => troca(r.talhao.id)} />
                  <span className="cor" style={{ background: COR_NIVEL[r.estado.nivel] }} aria-hidden />
                  <b>{r.talhao.nome}</b>
                  <span className="mudo">{r.ciclo && r.ciclo.status !== 'Colhido' ? r.ciclo.cultura : 'Sem lavoura'} · {fmtN(Number(r.talhao.area_ha), 1)} ha</span>
                </label>
              </li>
            ))}
            {!visiveis.length && <li className="mudo vazio-busca">Nenhum talhão com “{busca}”.</li>}
          </ul>
        </div>

        <footer>
          <button className="primario" onClick={concluir} disabled={!marcados.size}>
            {marcados.size ? `Mostrar ${marcados.size === resumos.length ? 'todos os' : marcados.size} talhões` : 'Marque ao menos um talhão'}
          </button>
        </footer>
      </div>
    </div>
  )
}
