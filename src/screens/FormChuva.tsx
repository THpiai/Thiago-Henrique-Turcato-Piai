import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao } from '../lib/hooks'
import { hojeISO, num, uuid } from '../lib/formato'
import { salvar } from '../lib/sync'
import { Aviso, Rotulo } from '../components/ui'

/** Leitura de todos os pluviômetros de uma vez. */
export function FormChuva({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  const talhoes = (useLive(() => db.talhoes.orderBy('nome').toArray()) ?? []).filter((t) => t.ativo !== false)
  const comPluv = talhoes.filter((t) => t.pluviometro)
  const lista = comPluv.length ? comPluv : talhoes
  const [data, setData] = useState(hojeISO())
  const [mm, setMm] = useState<Record<string, string>>({})
  const [salvo, setSalvo] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const linhas = lista.filter((t) => num(mm[t.id]) != null).map((t) => ({
      id: uuid(), data, talhao_id: t.id, milimetros: num(mm[t.id])!, fonte: 'Pluviômetro', autor_id: eu.id,
    }))
    if (!linhas.length) return
    await salvar('chuva', linhas)
    setSalvo(true)
    setTimeout(pronto, 900)
  }

  if (salvo) return <div className="tela"><Aviso tipo="ok">Chuva salva. ✔</Aviso></div>
  return (
    <form className="tela" onSubmit={enviar}>
      <h1>Chuva</h1>
      <Rotulo t="Dia da leitura"><input type="date" required value={data} onChange={(e) => setData(e.target.value)} /></Rotulo>
      {!comPluv.length && talhoes.length > 0 && <Aviso>Nenhum talhão marcado com pluviômetro; mostrando todos.</Aviso>}
      <div className="pluvs">
        {lista.map((t) => (
          <Rotulo key={t.id} t={t.nome}>
            <input inputMode="decimal" placeholder="mm" value={mm[t.id] ?? ''} onChange={(e) => setMm({ ...mm, [t.id]: e.target.value })} />
          </Rotulo>
        ))}
      </div>
      <p className="mudo">Deixe em branco o que não foi lido. Onde não houver leitura, o painel usa a estimativa automática do clima.</p>
      <button className="primario fixo">Salvar leituras</button>
    </form>
  )
}
