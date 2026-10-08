import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao, useGps } from '../lib/hooks'
import { TIPOS_CAMPO, TIPOS_MIP, URGENCIAS } from '../lib/opcoes'
import { agoraLocal, num, uuid } from '../lib/formato'
import { cicloAtual, statusMip } from '../lib/painel'
import { salvar } from '../lib/sync'
import { Aviso, Escolha, Rotulo, SeletorTalhao } from '../components/ui'

const UNIDADES_NIVEL = ['insetos/m', 'insetos/pano', '% desfolha', '% plantas', '% severidade', 'plantas/m²']

export function FormCampo({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  const { pos } = useGps()
  const ciclos = (useLive(() => db.ciclos.toArray()) ?? []).filter((c) => !c.excluido_em)
  const [talhaoId, setTalhaoId] = useState('')
  const [tipo, setTipo] = useState<string>('')
  const [quando, setQuando] = useState(agoraLocal())
  const [alvo, setAlvo] = useState('')
  const [nivel, setNivel] = useState('')
  const [unidade, setUnidade] = useState('')
  const [controle, setControle] = useState('')
  const [urgencia, setUrgencia] = useState<(typeof URGENCIAS)[number] | ''>('')
  const [desc, setDesc] = useState('')
  const [salvo, setSalvo] = useState(false)
  const mip = TIPOS_MIP.includes(tipo)
  const status = statusMip(tipo, num(nivel), num(controle))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const ciclo = cicloAtual(talhaoId, ciclos)
    await salvar('campo', [{
      id: uuid(), data_hora: new Date(quando).toISOString(), autor_id: eu.id, talhao_id: talhaoId,
      ciclo_id: ciclo?.status === 'Em andamento' ? ciclo.id : null, tipo, alvo: alvo || null,
      nivel_encontrado: mip ? num(nivel) : null, unidade_nivel: mip ? unidade || null : null,
      nivel_de_controle: mip ? num(controle) : null, urgencia: urgencia || null, status,
      latitude: pos?.p[0] ?? null, longitude: pos?.p[1] ?? null, descricao: desc || null,
    }])
    setSalvo(true)
    setTimeout(pronto, 900)
  }

  if (salvo) return <div className="tela"><Aviso tipo="ok">Registro salvo. ✔</Aviso></div>
  return (
    <form className="tela" onSubmit={enviar}>
      <h1>Monitoramento</h1>
      <SeletorTalhao valor={talhaoId} muda={setTalhaoId} />
      <Escolha t="O que encontrou" opcoes={TIPOS_CAMPO} valor={tipo} muda={setTipo} />
      <Rotulo t={mip ? 'Alvo (praga, doença ou daninha)' : 'Item'}>
        <input value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder={mip ? 'Ex.: percevejo-marrom, lagarta, ferrugem' : ''} list="alvos" />
      </Rotulo>
      <datalist id="alvos">
        {['Percevejo-marrom', 'Lagarta-falsa-medideira', 'Helicoverpa', 'Mosca-branca', 'Cigarrinha-do-milho', 'Pulgão', 'Ferrugem-asiática', 'Mancha-alvo', 'Antracnose', 'Buva', 'Capim-amargoso', 'Broca-da-cana', 'Cigarrinha-das-raízes'].map((a) => <option key={a} value={a} />)}
      </datalist>
      {mip && (
        <fieldset>
          <legend>Nível (MIP)</legend>
          <div className="tres">
            <Rotulo t="Encontrado"><input inputMode="decimal" value={nivel} onChange={(e) => setNivel(e.target.value)} /></Rotulo>
            <Rotulo t="Unidade">
              <input value={unidade} onChange={(e) => setUnidade(e.target.value)} list="unidades-nivel" />
            </Rotulo>
            <Rotulo t="Nível de controle"><input inputMode="decimal" value={controle} onChange={(e) => setControle(e.target.value)} /></Rotulo>
          </div>
          <datalist id="unidades-nivel">{UNIDADES_NIVEL.map((u) => <option key={u} value={u} />)}</datalist>
          {status === 'Aplicação indicada' && <Aviso tipo="alerta">Acima do nível de controle: vai aparecer como <b>aplicação indicada</b> no painel.</Aviso>}
          {status === 'Monitorando' && <Aviso>Abaixo do nível de controle: fica em monitoramento.</Aviso>}
        </fieldset>
      )}
      <div className="duas">
        <Rotulo t="Quando"><input type="datetime-local" required value={quando} onChange={(e) => setQuando(e.target.value)} /></Rotulo>
        <Escolha t="Urgência" opcoes={URGENCIAS} valor={urgencia} muda={setUrgencia} />
      </div>
      <Rotulo t="Descrição"><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Rotulo>
      <button className="primario fixo" disabled={!talhaoId || !tipo}>Salvar</button>
    </form>
  )
}
