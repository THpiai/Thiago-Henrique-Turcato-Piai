import { useEffect, useMemo, useState } from 'react'
import type { Dados, Resumo } from '../lib/painel'
import { casaBusca, gruposDeTalhoes, type Grupo } from '../lib/filtro'
import type { useTalhaoGps } from '../lib/hooks'
import { fmtN } from '../lib/formato'
import { Icone } from './Icone'

const TIPOS: Grupo['tipo'][] = ['Sede', 'Cultura', 'Situação']

/**
 * Escolha de um ou vários talhões no formulário: busca por nome, marcar vários e os mesmos
 * atalhos do filtro (sede, cultura, situação). O GPS marca sozinho o talhão onde a pessoa está.
 */
export function SeletorTalhoes({ resumos, d, marcados, muda, gps }: {
  resumos: Resumo[]; d: Pick<Dados, 'sedes'>; marcados: string[]; muda: (ids: string[]) => void; gps: ReturnType<typeof useTalhaoGps>
}) {
  const [busca, setBusca] = useState('')
  const { talhaoId, erro, pos } = gps
  const [tocado, setTocado] = useState(false)
  useEffect(() => {
    if (!tocado && talhaoId && !marcados.length) muda([talhaoId])
  }, [talhaoId, tocado, marcados.length, muda])
  const grupos = useMemo(() => gruposDeTalhoes(resumos, d), [resumos, d])
  const set = new Set(marcados)
  const visiveis = busca ? resumos.filter((r) => casaBusca(r.talhao.nome, busca)) : resumos
  const area = resumos.filter((r) => set.has(r.talhao.id)).reduce((s, r) => s + Number(r.talhao.area_ha), 0)
  const troca = (ids: string[]) => { setTocado(true); muda(ids) }
  const alterna = (id: string) => troca(set.has(id) ? marcados.filter((x) => x !== id) : [...marcados, id])
  // Atalho soma o grupo à escolha; tocar de novo tira o grupo.
  const tudoDo = (g: Grupo) => g.ids.every((id) => set.has(id))
  const grupo = (g: Grupo) => troca(tudoDo(g) ? marcados.filter((id) => !g.ids.includes(id)) : [...new Set([...marcados, ...g.ids])])
  const todosVisiveis = visiveis.length > 0 && visiveis.every((r) => set.has(r.talhao.id))
  const sugerido = resumos.find((r) => r.talhao.id === talhaoId)

  return (
    <div className="campo seletor-talhoes">
      <span className="rotulo">Talhões <small className="mudo">{marcados.length ? `${marcados.length} marcado(s) · ${fmtN(area, 1)} ha` : 'marque um ou mais'}</small></span>
      <label className="busca">
        <Icone n="lupa" t={18} />
        <input type="search" placeholder="Buscar talhão pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar talhão"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (visiveis.length === 1) alterna(visiveis[0].talhao.id) } }} />
      </label>
      {resumos.length > 3 && (
        <div className="atalhos-linha">
          {TIPOS.flatMap((tipo) => grupos.filter((g) => g.tipo === tipo)).map((g) => (
            <button type="button" key={g.tipo + g.nome} className={tudoDo(g) ? 'chip on' : 'chip'} aria-pressed={tudoDo(g)} onClick={() => grupo(g)}>
              {g.nome} <span className="conta">{g.ids.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="marcar">
        <button type="button" className="link" onClick={() => {
          const vis = visiveis.map((r) => r.talhao.id)
          troca(todosVisiveis ? marcados.filter((id) => !vis.includes(id)) : [...new Set([...marcados, ...vis])])
        }}>{todosVisiveis ? (busca ? 'Desmarcar encontrados' : 'Desmarcar todos') : (busca ? 'Marcar encontrados' : 'Marcar todos')}</button>
        {marcados.length > 0 && <button type="button" className="link" onClick={() => troca([])}>Limpar</button>}
      </div>
      <ul className="lista-marcar compacta">
        {visiveis.map((r) => (
          <li key={r.talhao.id}>
            <label>
              <input type="checkbox" checked={set.has(r.talhao.id)} onChange={() => alterna(r.talhao.id)} />
              <b>{r.talhao.nome}</b>
              <span className="mudo">{r.ciclo && r.ciclo.status !== 'Colhido' ? r.ciclo.cultura : 'Sem lavoura'} · {fmtN(Number(r.talhao.area_ha), 1)} ha</span>
            </label>
          </li>
        ))}
        {!visiveis.length && <li className="mudo vazio-busca">{resumos.length ? `Nenhum talhão com “${busca}”.` : 'Nenhum talhão cadastrado.'}</li>}
      </ul>
      <small className="dica">{sugerido ? `Você está no ${sugerido.talhao.nome} (pelo GPS)` : pos ? 'GPS fora dos talhões cadastrados' : erro ?? 'Procurando GPS…'}</small>
    </div>
  )
}
