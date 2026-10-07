import { liveQuery } from 'dexie'
import { createContext, useContext, useEffect, useState } from 'react'
import { db } from './db'
import type { Dados } from './painel'
import type { Pessoa } from './tipos'
import { talhaoDoPonto, type Ponto } from './geo'

/** Lê do banco do celular e redesenha sozinho quando algo muda. */
export function useLive<T>(consulta: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [v, setV] = useState<T>()
  useEffect(() => {
    const s = liveQuery(consulta).subscribe({ next: setV, error: console.error })
    return () => s.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

export function useDados(): Dados | undefined {
  return useLive(async () => ({
    talhoes: (await db.talhoes.toArray()).filter((t) => t.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })),
    ciclos: await db.ciclos.toArray(),
    operacoes: await db.operacoes.toArray(),
    produtos: await db.operacao_produtos.toArray(),
    campo: await db.campo.toArray(),
    chuva: await db.chuva.toArray(),
    saldos: await db.saldos.toArray(),
    sedes: await db.sedes.toArray(),
  }))
}

export type Sessao = { eu: Pessoa; gestor: boolean; dono: boolean; sair: () => void }
export const SessaoCtx = createContext<Sessao | null>(null)
export const useSessao = () => useContext(SessaoCtx)!

/** Posição do GPS e o talhão em que a pessoa está. */
export function useGps(ativo = true) {
  const [pos, setPos] = useState<{ p: Ponto; precisao: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!ativo || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (g) => { setPos({ p: [g.coords.latitude, g.coords.longitude], precisao: g.coords.accuracy }); setErro(null) },
      (e) => setErro(e.code === 1 ? 'GPS sem permissão' : 'Procurando GPS…'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [ativo])
  return { pos, erro }
}

export function useTalhaoGps() {
  const { pos, erro } = useGps()
  const talhoes = useLive(() => db.talhoes.toArray())
  const id = pos && talhoes ? talhaoDoPonto(pos.p, talhoes) : null
  return { pos, erro, talhaoId: id }
}
