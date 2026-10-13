import { useCallback, useEffect, useState } from 'react'
import { sedeDoTalhao, type Dados, type Resumo } from './painel'

/**
 * Filtro de talhões estilo BI: uma seleção só para o app todo (Início, Atenção e Safra),
 * guardada no aparelho até alguém limpar. `null` = todos os talhões.
 */
export type Selecao = string[] | null

const CHAVE = 'piai-filtro-talhoes'
const EVENTO = 'piai-filtro'

export function lerSelecao(): Selecao {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? 'null')
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null
  } catch { return null }
}

function gravarSelecao(s: Selecao) {
  try { if (s) localStorage.setItem(CHAVE, JSON.stringify(s)); else localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENTO))
}

/** Seleção compartilhada entre as telas; muda em uma, redesenha todas. */
export function useSelecao(): [Selecao, (s: Selecao) => void] {
  const [s, setS] = useState<Selecao>(lerSelecao)
  useEffect(() => {
    const f = () => setS(lerSelecao())
    window.addEventListener(EVENTO, f); window.addEventListener('storage', f)
    return () => { window.removeEventListener(EVENTO, f); window.removeEventListener('storage', f) }
  }, [])
  return [s, useCallback((x: Selecao) => gravarSelecao(x), [])]
}

/** Talhão está na seleção? Talhão que não existia quando a seleção foi feita fica de fora. */
export const naSelecao = (s: Selecao, id: string) => s === null || s.includes(id)

/** Normaliza: marcar todos (ou nenhum talhão válido) volta a ser "todos". */
export function normalizar(ids: Iterable<string>, todos: string[]): Selecao {
  const set = new Set(ids)
  const validos = todos.filter((id) => set.has(id))
  return validos.length === 0 || validos.length === todos.length ? null : validos
}

export type Grupo = { tipo: 'Sede' | 'Cultura' | 'Situação'; nome: string; ids: string[] }

/** Atalhos do seletor: por sede mais próxima, pela cultura em campo e pela situação do momento. */
export function gruposDeTalhoes(resumos: Resumo[], d: Pick<Dados, 'sedes'>): Grupo[] {
  const grupos: Grupo[] = []
  const junta = (tipo: Grupo['tipo'], nome: string, id: string) => {
    const g = grupos.find((x) => x.tipo === tipo && x.nome === nome)
    if (g) g.ids.push(id); else grupos.push({ tipo, nome, ids: [id] })
  }
  for (const r of resumos) {
    const sede = d.sedes.length > 1 ? sedeDoTalhao(r.talhao, d.sedes) : undefined
    if (sede) junta('Sede', sede.nome, r.talhao.id)
  }
  for (const r of resumos) junta('Cultura', r.ciclo && r.ciclo.status !== 'Colhido' ? r.ciclo.cultura : 'Sem lavoura', r.talhao.id)
  for (const r of resumos) {
    if (r.estado.nivel === 'critico') junta('Situação', 'Crítico', r.talhao.id)
    if (r.estado.nivel === 'critico' || r.estado.nivel === 'atencao') junta('Situação', 'Crítico + atenção', r.talhao.id)
  }
  const ordemSit = ['Crítico', 'Crítico + atenção']
  return grupos.sort((a, b) => a.tipo.localeCompare(b.tipo) ||
    (a.tipo === 'Situação' ? ordemSit.indexOf(a.nome) - ordemSit.indexOf(b.nome) : a.nome.localeCompare(b.nome, 'pt-BR')))
}

/** Busca sem acento e sem diferença de maiúsculas; "t1" acha "T1" e "T10". */
export function casaBusca(nome: string, busca: string) {
  const n = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return n(nome).includes(n(busca))
}
