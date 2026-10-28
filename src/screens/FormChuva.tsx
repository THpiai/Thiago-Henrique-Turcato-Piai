import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useGravar, useIds, useLive, useSessao } from '../lib/hooks'
import { hojeISO, num } from '../lib/formato'
import { sedeDoTalhao } from '../lib/painel'
import { salvar } from '../lib/sync'
import { Aviso, Rotulo } from '../components/ui'

/**
 * Leitura de chuva. Pluviômetro da sede vale para todos os talhões ligados a ela (os mais próximos);
 * pluviômetro de um talhão vale só para ele e vence o da sede naquele dia.
 */
export function FormChuva({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  const sedes = useLive(() => db.sedes.toArray().then((l) => l.sort((a, b) => a.nome.localeCompare(b.nome)))) ?? []
  const talhoes = (useLive(() => db.talhoes.orderBy('nome').toArray()) ?? []).filter((t) => t.ativo !== false)
  const comPluv = talhoes.filter((t) => t.pluviometro)
  const [data, setData] = useState(hojeISO())
  const [mmSede, setMmSede] = useState<Record<string, string>>({})
  const [mm, setMm] = useState<Record<string, string>>({})
  const [salvo, setSalvo] = useState(false)

  const talhoesDa = (sedeId: string) => talhoes.filter((t) => sedeDoTalhao(t, sedes)?.id === sedeId)

  const id = useIds()
  const { salvando, gravar } = useGravar()
  async function enviar(e: FormEvent) {
    e.preventDefault()
    const base = { data, fonte: 'Pluviômetro', autor_id: eu.id }
    const linhas = [
      ...sedes.filter((s) => num(mmSede[s.id]) != null)
        .map((s) => ({ ...base, id: id(`sede:${s.id}:${data}`), talhao_id: null, sede_id: s.id, milimetros: num(mmSede[s.id])! })),
      ...comPluv.filter((t) => num(mm[t.id]) != null)
        .map((t) => ({ ...base, id: id(`talhao:${t.id}:${data}`), talhao_id: t.id, sede_id: sedeDoTalhao(t, sedes)?.id ?? null, milimetros: num(mm[t.id])! })),
    ]
    if (!linhas.length) return
    if (!(await gravar(() => salvar('chuva', linhas)))) return
    setSalvo(true)
    setTimeout(pronto, 900)
  }

  if (salvo) return <div className="tela"><Aviso tipo="ok">Chuva salva. ✔</Aviso></div>
  return (
    <form className="tela" onSubmit={enviar}>
      <h1>Chuva</h1>
      <Rotulo t="Dia da leitura"><input type="date" required value={data} onChange={(e) => setData(e.target.value)} /></Rotulo>

      <h2>Pluviômetro das sedes</h2>
      <div className="pluvs">
        {sedes.map((s) => {
          const n = talhoesDa(s.id).length
          return (
            <Rotulo key={s.id} t={s.nome} dica={n ? `Vale para ${n} ${n === 1 ? 'talhão próximo' : 'talhões próximos'}` : 'Nenhum talhão ligado a esta sede'}>
              <input inputMode="decimal" placeholder="mm" aria-label={`Chuva na sede ${s.nome} (mm)`} value={mmSede[s.id] ?? ''} onChange={(e) => setMmSede({ ...mmSede, [s.id]: e.target.value })} />
            </Rotulo>
          )
        })}
      </div>
      {!sedes.length && <Aviso>As sedes ainda não chegaram neste aparelho. Conecte à internet uma vez para baixar.</Aviso>}

      {comPluv.length > 0 && (
        <>
          <h2>Pluviômetro nos talhões</h2>
          <div className="pluvs">
            {comPluv.map((t) => (
              <Rotulo key={t.id} t={t.nome}>
                <input inputMode="decimal" placeholder="mm" value={mm[t.id] ?? ''} onChange={(e) => setMm({ ...mm, [t.id]: e.target.value })} />
              </Rotulo>
            ))}
          </div>
        </>
      )}
      <p className="mudo">Deixe em branco o que não foi lido. A leitura do talhão vale só para ele; a da sede vale para os talhões mais próximos dela. Onde não houver leitura, o painel usa a estimativa automática do clima.</p>
      <button className="primario fixo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar leituras'}</button>
    </form>
  )
}
