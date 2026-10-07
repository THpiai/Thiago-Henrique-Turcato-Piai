import { useEffect, useState, type ReactNode } from 'react'
import { estado, ouvirSync, sincronizar, type Estado } from '../lib/sync'
import { supabase } from '../lib/supabase'
import { fmtDataHora } from '../lib/formato'
import { db } from '../lib/db'
import { useLive, useTalhaoGps } from '../lib/hooks'

export function Rotulo({ t, children, dica }: { t: string; children: ReactNode; dica?: string }) {
  return (
    <label className="campo">
      <span className="rotulo">{t}</span>
      {children}
      {dica && <small className="dica">{dica}</small>}
    </label>
  )
}

/** Botões de escolha única. Fica fora de <label> para o toque no título não marcar a primeira opção. */
export function Escolha<T extends string>({ t, dica, opcoes, valor, muda }: { t: string; dica?: string; opcoes: readonly T[]; valor: T | ''; muda: (v: T) => void }) {
  return (
    <div className="campo">
      <span className="rotulo">{t}</span>
    <div className="chips" role="radiogroup" aria-label={t}>
      {opcoes.map((o) => (
        <button type="button" key={o} role="radio" aria-checked={valor === o} className={valor === o ? 'chip on' : 'chip'} onClick={() => muda(o)}>
          {o}
        </button>
      ))}
    </div>
      {dica && <small className="dica">{dica}</small>}
    </div>
  )
}

/** Escolhe o talhão. Sugere pelo GPS quando a pessoa está dentro (ou perto) de um talhão. */
export function SeletorTalhao({ valor, muda }: { valor: string; muda: (id: string) => void }) {
  const talhoes = useLive(() => db.talhoes.orderBy('nome').toArray()) ?? []
  const { talhaoId, erro, pos } = useTalhaoGps()
  const [tocado, setTocado] = useState(false)
  useEffect(() => { if (!tocado && talhaoId && !valor) muda(talhaoId) }, [talhaoId, tocado, valor, muda])
  const sugerido = talhoes.find((t) => t.id === talhaoId)
  return (
    <Rotulo t="Talhão" dica={sugerido ? `📍 Você está no ${sugerido.nome}` : pos ? 'GPS fora dos talhões cadastrados' : erro ?? 'Procurando GPS…'}>
      <select required value={valor} onChange={(e) => { setTocado(true); muda(e.target.value) }}>
        <option value="">Escolha…</option>
        {talhoes.filter((t) => t.ativo !== false).map((t) => (
          <option key={t.id} value={t.id}>{t.nome} · {Number(t.area_ha).toLocaleString('pt-BR')} ha</option>
        ))}
      </select>
    </Rotulo>
  )
}

export function BarraSync() {
  const [e, setE] = useState<Estado>()
  useEffect(() => {
    const ler = () => void estado().then(setE)
    ler()
    const tira = ouvirSync(ler)
    window.addEventListener('online', ler); window.addEventListener('offline', ler)
    return () => { tira(); window.removeEventListener('online', ler); window.removeEventListener('offline', ler) }
  }, [])
  if (!e) return null
  const cls = e.comErro ? 'sync erro' : !e.online ? 'sync off' : e.pendentes ? 'sync pend' : 'sync ok'
  const txt = e.comErro
    ? `${e.comErro} registro(s) com problema`
    : !e.online
      ? e.pendentes ? `Sem sinal · ${e.pendentes} guardado(s) no celular` : 'Sem sinal · pode registrar normalmente'
      : e.enviando ? 'Enviando…'
        : e.pendentes ? `${e.pendentes} aguardando envio` : `Tudo enviado${e.ultimaSync ? ' · ' + fmtDataHora(e.ultimaSync) : ''}`
  return (
    <button className={cls} data-testid="sync" onClick={() => void sincronizar(supabase)} title="Toque para sincronizar agora">
      <span className="ponto" /> {txt}
    </button>
  )
}

export function Aviso({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'alerta' | 'ok' }) {
  return <div className={`aviso ${tipo}`}>{children}</div>
}
