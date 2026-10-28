import { useCallback, useEffect, useRef, useState } from 'react'
import { ATALHOS, faixaDoPeriodo, mesmoPeriodo, PADRAO, rotuloPeriodo, usePeriodo, type Periodo } from '../lib/periodo'
import { hojeISO } from '../lib/formato'
import { Icone } from './Icone'

/** Barra do filtro de período: mostra o período atual e abre os atalhos e as datas. Vale em todas as telas. */
export function FiltroPeriodo({ padrao = 'Safra inteira' }: { padrao?: string }) {
  const [p, setP] = usePeriodo()
  const [aberto, setAberto] = useState(false)
  const fechar = useCallback(() => setAberto(false), [])
  const filtrando = p.tipo !== 'safra'
  return (
    <div className={filtrando ? 'filtro-barra ativo' : 'filtro-barra'}>
      <button className="filtro-botao" onClick={() => setAberto(true)} aria-haspopup="dialog">
        <Icone n="calendario" t={18} />
        <span>{filtrando ? <b>{rotuloPeriodo(p)}</b> : <>{padrao}</>}</span>
      </button>
      {filtrando && <button className="filtro-limpar" onClick={() => setP(PADRAO)} aria-label="Limpar período"><Icone n="x" t={16} />Limpar</button>}
      {aberto && <Seletor atual={p} muda={setP} fechar={fechar} padrao={padrao} />}
    </div>
  )
}

function Seletor({ atual, muda, fechar, padrao }: { atual: Periodo; muda: (p: Periodo) => void; fechar: () => void; padrao: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const hoje = hojeISO()
  const f = faixaDoPeriodo(atual)
  const [de, setDe] = useState(f?.de ?? '')
  const [ate, setAte] = useState(f?.ate ?? hoje)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', tecla)
    document.body.classList.add('sem-rolagem')
    caixa.current?.focus()
    return () => { window.removeEventListener('keydown', tecla); document.body.classList.remove('sem-rolagem') }
  }, [fechar])
  const escolhe = (p: Periodo) => { muda(p); fechar() }
  const datasOk = !!de && !!ate && de <= ate

  return (
    <div className="painel-fundo" onClick={fechar}>
      <div className="painel-filtro painel-periodo" role="dialog" aria-modal="true" aria-label="Escolher período" ref={caixa} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header>
          <div><b>Período</b><small>Vale para Início, Safra e Talhão</small></div>
          <button className="icone-btn" onClick={fechar} aria-label="Fechar"><Icone n="x" t={18} /></button>
        </header>
        <div className="painel-corpo">
          <div className="atalhos">
            <small>Atalhos</small>
            <div>
              {ATALHOS.map((a) => (
                <button key={a.rotulo} className={mesmoPeriodo(a.p, atual) ? 'chip on' : 'chip'} aria-pressed={mesmoPeriodo(a.p, atual)} onClick={() => escolhe(a.p)}>
                  {a.p.tipo === 'safra' ? padrao : a.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="atalhos">
            <small>Escolher datas</small>
            <div className="datas">
              <label className="campo"><span className="rotulo">De</span><input type="date" value={de} max={ate || hoje} onChange={(e) => setDe(e.target.value)} /></label>
              <label className="campo"><span className="rotulo">Até</span><input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label>
            </div>
          </div>
        </div>
        <footer>
          <button className="primario" disabled={!datasOk} onClick={() => escolhe({ tipo: 'datas', de, ate })}>
            {datasOk ? 'Mostrar essas datas' : 'Escolha as duas datas'}
          </button>
        </footer>
      </div>
    </div>
  )
}
