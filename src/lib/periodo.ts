import { useCallback, useEffect, useState } from 'react'
import { fmtData, hojeISO } from './formato'

/**
 * Filtro de período estilo BI: um só para o app todo (Início, Safra e Talhão), guardado no
 * aparelho até alguém limpar, igual ao filtro de talhões. "safra" = a safra inteira (o padrão).
 */
export type Periodo =
  | { tipo: 'safra' }
  | { tipo: 'dias'; dias: number }
  | { tipo: 'ano' }
  | { tipo: 'datas'; de: string; ate: string }

/** Datas (AAAA-MM-DD), as duas pontas incluídas. */
export type Faixa = { de: string; ate: string }

/** Registros (operações, chuva, problemas) que o celular guarda: 2 anos. Safras ficam todas. */
export const DIAS_NO_CELULAR = 730

export const PADRAO: Periodo = { tipo: 'safra' }
export const ATALHOS: { rotulo: string; p: Periodo }[] = [
  { rotulo: 'Safra inteira', p: { tipo: 'safra' } },
  { rotulo: 'Últimos 7 dias', p: { tipo: 'dias', dias: 7 } },
  { rotulo: 'Últimos 30 dias', p: { tipo: 'dias', dias: 30 } },
  { rotulo: 'Últimos 90 dias', p: { tipo: 'dias', dias: 90 } },
  { rotulo: 'Este ano', p: { tipo: 'ano' } },
  { rotulo: 'Últimos 12 meses', p: { tipo: 'dias', dias: 365 } },
]

const CHAVE = 'piai-filtro-periodo'
const EVENTO = 'piai-periodo'
const DATA = /^\d{4}-\d{2}-\d{2}$/

export function lerPeriodo(): Periodo {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? 'null')
    if (v?.tipo === 'dias' && Number.isInteger(v.dias) && v.dias > 0 && v.dias <= 3660) return { tipo: 'dias', dias: v.dias }
    if (v?.tipo === 'ano') return { tipo: 'ano' }
    if (v?.tipo === 'datas' && DATA.test(v.de) && DATA.test(v.ate) && v.de <= v.ate) return { tipo: 'datas', de: v.de, ate: v.ate }
  } catch { /* sem armazenamento */ }
  return PADRAO
}

function gravarPeriodo(p: Periodo) {
  try { if (p.tipo === 'safra') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, JSON.stringify(p)) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENTO))
}

/** Período compartilhado entre as telas; muda em uma, redesenha todas. */
export function usePeriodo(): [Periodo, (p: Periodo) => void] {
  const [p, setP] = useState<Periodo>(lerPeriodo)
  useEffect(() => {
    const f = () => setP(lerPeriodo())
    window.addEventListener(EVENTO, f); window.addEventListener('storage', f)
    return () => { window.removeEventListener(EVENTO, f); window.removeEventListener('storage', f) }
  }, [])
  return [p, useCallback((x: Periodo) => gravarPeriodo(x), [])]
}

const menosDias = (dia: string, n: number) => new Date(new Date(dia + 'T12:00:00Z').getTime() - n * 864e5).toISOString().slice(0, 10)

/** Datas do período. `null` = safra inteira (cada tela usa as datas da própria safra). */
export function faixaDoPeriodo(p: Periodo, hoje = hojeISO()): Faixa | null {
  if (p.tipo === 'dias') return { de: menosDias(hoje, p.dias - 1), ate: hoje }
  if (p.tipo === 'ano') return { de: hoje.slice(0, 4) + '-01-01', ate: hoje }
  if (p.tipo === 'datas') return { de: p.de, ate: p.ate }
  return null
}

export const mesmoPeriodo = (a: Periodo, b: Periodo) => JSON.stringify(a) === JSON.stringify(b)

export function rotuloPeriodo(p: Periodo, hoje = hojeISO()): string {
  const atalho = ATALHOS.find((x) => mesmoPeriodo(x.p, p))
  if (atalho) return p.tipo === 'ano' ? `Este ano (${hoje.slice(0, 4)})` : atalho.rotulo
  const f = faixaDoPeriodo(p, hoje)!
  const ano = (d: string) => (d.slice(0, 4) === hoje.slice(0, 4) ? '' : '/' + d.slice(2, 4))
  return `${fmtData(f.de)}${ano(f.de)} a ${fmtData(f.ate)}${ano(f.ate)}`
}

/** Dia (AAAA-MM-DD) dentro da faixa? Sem faixa, tudo vale. */
export const naFaixa = (dia: string | null | undefined, f: Faixa | null) => !f || (!!dia && dia >= f.de && dia <= f.ate)
