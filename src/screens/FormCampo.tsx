import { useEffect, useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao, useGps } from '../lib/hooks'
import { agoraLocal, num, uuid } from '../lib/formato'
import { cicloAberto } from '../lib/safra'
import { GRAVIDADES, QUEM_VIU, TIPOS_PROBLEMA } from '../lib/problemas'
import { salvar } from '../lib/sync'
import { Aviso, Escolha, Rotulo, SeletorTalhao } from '../components/ui'
import { MapaPonto } from '../components/MapaPonto'
import type { Ponto } from '../lib/geo'

const NOMES: Record<string, string[]> = {
  Praga: ['Percevejo-marrom', 'Lagarta-falsa-medideira', 'Helicoverpa', 'Lagarta-do-cartucho', 'Mosca-branca', 'Cigarrinha-do-milho', 'Pulgão', 'Broca-da-cana', 'Cigarrinha-das-raízes', 'Sphenophorus'],
  'Planta daninha': ['Buva', 'Capim-amargoso', 'Capim-pé-de-galinha', 'Caruru', 'Corda-de-viola', 'Trapoeraba', 'Soja tiguera', 'Milho tiguera'],
  Doença: ['Ferrugem-asiática', 'Mancha-alvo', 'Antracnose', 'Mofo-branco', 'Cercosporiose', 'Mancha-branca', 'Enfezamento', 'Ferrugem-alaranjada'],
  'Falha de estande': ['Falha no plantio', 'Morte de plantas', 'Replantio necessário'],
}

/** Foto reduzida (até 1600 px, JPEG): economiza dados e espaço no celular. */
async function reduzir(arq: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(arq)
    const k = Math.min(1, 1600 / Math.max(img.width, img.height))
    const tela = document.createElement('canvas')
    tela.width = Math.round(img.width * k); tela.height = Math.round(img.height * k)
    tela.getContext('2d')!.drawImage(img, 0, 0, tela.width, tela.height)
    return await new Promise((ok) => tela.toBlob((b) => ok(b ?? arq), 'image/jpeg', 0.8))
  } catch {
    return arq
  }
}

/** Registro rápido de problema: tipo, nome se souber, gravidade, foto, ponto e quem viu. */
export function FormCampo({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  const { pos } = useGps()
  const ciclos = (useLive(() => db.ciclos.toArray()) ?? []).filter((c) => !c.excluido_em)
  const talhoes = useLive(() => db.talhoes.toArray()) ?? []
  const [talhaoId, setTalhaoId] = useState('')
  const [tipo, setTipo] = useState<string>('')
  const [alvo, setAlvo] = useState('')
  const [grav, setGrav] = useState<(typeof GRAVIDADES)[number] | ''>('')
  const [quem, setQuem] = useState<(typeof QUEM_VIU)[number]>('Equipe')
  const [ponto, setPonto] = useState<Ponto | null>(null)
  const [marcado, setMarcado] = useState(false)
  const [foto, setFoto] = useState<Blob | null>(null)
  const [verFoto, setVerFoto] = useState<string | null>(null)
  const [quando, setQuando] = useState(agoraLocal())
  const [contagem, setContagem] = useState('')
  const [unidade, setUnidade] = useState('')
  const [desc, setDesc] = useState('')
  const [salvo, setSalvo] = useState(false)
  const talhao = talhoes.find((t) => t.id === talhaoId)

  // O ponto segue o GPS até a pessoa tocar no mapa.
  useEffect(() => { if (!marcado && pos) setPonto(pos.p) }, [pos, marcado])
  useEffect(() => () => { if (verFoto) URL.revokeObjectURL(verFoto) }, [verFoto])

  async function escolherFoto(arq?: File) {
    if (!arq) return
    const b = await reduzir(arq)
    setFoto(b)
    setVerFoto(URL.createObjectURL(b))
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const id = uuid()
    const ciclo = cicloAberto(talhaoId, ciclos)
    const fotoPath = foto ? `campo/${id}.jpg` : null
    if (foto) await db.fotos.put({ path: fotoPath!, blob: foto, enviada: 0, criada_em: new Date().toISOString() })
    await salvar('campo', [{
      id, data_hora: new Date(quando).toISOString(), autor_id: eu.id, talhao_id: talhaoId,
      ciclo_id: ciclo?.id ?? null, tipo, alvo: alvo.trim() || null, gravidade: grav || null, quem_viu: quem,
      nivel_encontrado: num(contagem), unidade_nivel: num(contagem) != null ? unidade || null : null,
      status: 'Aberta', latitude: ponto?.[0] ?? null, longitude: ponto?.[1] ?? null,
      descricao: desc || null, foto_path: fotoPath,
    }])
    setSalvo(true)
    setTimeout(pronto, 900)
  }

  if (salvo) return <div className="tela"><Aviso tipo="ok">Problema registrado. ✔</Aviso></div>
  return (
    <form className="tela" onSubmit={enviar}>
      <h1>Problema no talhão</h1>
      <SeletorTalhao valor={talhaoId} muda={setTalhaoId} />
      <Escolha t="O que é" opcoes={TIPOS_PROBLEMA} valor={tipo as (typeof TIPOS_PROBLEMA)[number]} muda={setTipo} />
      <Rotulo t="Nome, se souber">
        <input value={alvo} onChange={(e) => setAlvo(e.target.value)} list="nomes-problema" placeholder={tipo === 'Praga' ? 'Ex.: percevejo, lagarta' : tipo === 'Doença' ? 'Ex.: ferrugem' : ''} />
      </Rotulo>
      <datalist id="nomes-problema">{(NOMES[tipo] ?? Object.values(NOMES).flat()).map((a) => <option key={a} value={a} />)}</datalist>
      <Escolha t="Gravidade" opcoes={GRAVIDADES} valor={grav} muda={setGrav} />
      <Escolha t="Quem viu" opcoes={QUEM_VIU} valor={quem} muda={setQuem} />

      <div className="foto-problema">
        <label className="secundario botao-foto">
          {foto ? 'Trocar foto' : 'Tirar foto'}
          <input type="file" accept="image/*" capture="environment" onChange={(e) => void escolherFoto(e.target.files?.[0])} hidden />
        </label>
        {verFoto && <img src={verFoto} alt="Foto do problema" />}
      </div>

      {talhaoId && (
        <fieldset>
          <legend>Onde</legend>
          <MapaPonto talhao={talhao} ponto={ponto} muda={(p) => { setPonto(p); setMarcado(true) }} />
          <small className="dica">{marcado ? 'Ponto marcado no mapa.' : pos ? 'Ponto do GPS. Toque no mapa para mudar.' : 'Toque no mapa para marcar o ponto.'}</small>
        </fieldset>
      )}

      <details className="mais-detalhes">
        <summary>Mais detalhes (opcional)</summary>
        <div className="duas">
          <Rotulo t="Contagem no ponto"><input inputMode="decimal" value={contagem} onChange={(e) => setContagem(e.target.value)} /></Rotulo>
          <Rotulo t="Unidade"><input value={unidade} onChange={(e) => setUnidade(e.target.value)} list="unidades-contagem" placeholder="Ex.: insetos/pano" /></Rotulo>
        </div>
        <datalist id="unidades-contagem">{['insetos/pano', 'insetos/m', 'plantas/m²', '% desfolha', '% plantas'].map((u) => <option key={u} value={u} />)}</datalist>
        <Rotulo t="Quando"><input type="datetime-local" required value={quando} onChange={(e) => setQuando(e.target.value)} /></Rotulo>
        <Rotulo t="Observação"><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Rotulo>
      </details>
      <button className="primario fixo" disabled={!talhaoId || !tipo || !grav}>Salvar problema</button>
    </form>
  )
}
