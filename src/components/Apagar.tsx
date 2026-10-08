import { useEffect, useState } from 'react'
import { Icone } from './Icone'

/** Lixeira com confirmação no próprio lugar (sem janela). */
export function BotaoApagar({ pergunta, detalhe, aoConfirmar, rotulo }: { pergunta: string; detalhe?: string; aoConfirmar: () => void; rotulo?: string }) {
  const [aberto, setAberto] = useState(false)
  if (!aberto)
    return (
      <button type="button" className={rotulo ? 'perigo' : 'icone-btn lixo'} onClick={(e) => { e.stopPropagation(); setAberto(true) }} aria-label={rotulo ? undefined : pergunta} title={pergunta}>
        <Icone n="lixo" t={rotulo ? 18 : 17} />{rotulo}
      </button>
    )
  return (
    <div className="confirmar" role="alertdialog" onClick={(e) => e.stopPropagation()}>
      <span><b>{pergunta}</b>{detalhe && <small>{detalhe}</small>}</span>
      <div>
        <button type="button" className="mini" onClick={() => setAberto(false)}>Cancelar</button>
        <button type="button" className="mini perigo-cheio" onClick={() => { setAberto(false); aoConfirmar() }}>Apagar</button>
      </div>
    </div>
  )
}

type Aviso = { id: number; texto: string; desfazer: () => void }
let ouvinte: ((a: Aviso) => void) | null = null
let seq = 0

/** Mostra "Apagado · Desfazer" por alguns segundos. */
export function mostrarDesfazer(texto: string, desfazer: () => void) {
  ouvinte?.({ id: ++seq, texto, desfazer })
}

export function BarraDesfazer() {
  const [a, setA] = useState<Aviso | null>(null)
  useEffect(() => { ouvinte = setA; return () => { ouvinte = null } }, [])
  useEffect(() => {
    if (!a) return
    const t = setTimeout(() => setA(null), 8000)
    return () => clearTimeout(t)
  }, [a])
  if (!a) return null
  return (
    <div className="barra-desfazer" role="status">
      <span>{a.texto}</span>
      <button onClick={() => { a.desfazer(); setA(null) }}>Desfazer</button>
    </div>
  )
}
