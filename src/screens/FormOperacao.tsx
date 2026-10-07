import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao, useGps } from '../lib/hooks'
import { TIPOS_OPERACAO } from '../lib/opcoes'
import { agoraLocal, fmtN, num, uuid } from '../lib/formato'
import { cicloAtual, climaNaHora, sedeDoTalhao } from '../lib/painel'
import { salvarOperacao } from '../lib/sync'
import { Aviso, Escolha, Rotulo, SeletorTalhao } from '../components/ui'
import type { OperacaoProduto } from '../lib/tipos'

type LinhaProduto = { id: string; insumo_id: string; dose: string }
const USA_PRODUTO = ['Plantio', 'Pulverização', 'Adubação', 'Calagem e gessagem']

export function FormOperacao({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  const { pos } = useGps()
  const insumos = useLive(() => db.insumos.orderBy('nome').toArray()) ?? []
  const talhoes = useLive(() => db.talhoes.toArray()) ?? []
  const ciclos = useLive(() => db.ciclos.toArray()) ?? []
  const sedes = useLive(() => db.sedes.toArray()) ?? []
  const clima = useLive(() => db.clima.toArray()) ?? []
  const [talhaoId, setTalhaoId] = useState('')
  const [tipo, setTipo] = useState<string>('')
  const [quando, setQuando] = useState(agoraLocal())
  const [area, setArea] = useState('')
  const [horas, setHoras] = useState('')
  const [alvo, setAlvo] = useState('')
  const [calda, setCalda] = useState('')
  const [temp, setTemp] = useState('')
  const [umid, setUmid] = useState('')
  const [vento, setVento] = useState('')
  const [receita, setReceita] = useState('')
  const [obs, setObs] = useState('')
  const [produtos, setProdutos] = useState<LinhaProduto[]>([])
  const [salvo, setSalvo] = useState(false)

  const talhao = talhoes.find((t) => t.id === talhaoId)
  const areaNum = num(area) ?? (talhao ? Number(talhao.area_ha) : null)
  const pulv = tipo === 'Pulverização'
  const sede = talhao ? sedeDoTalhao(talhao, sedes) : undefined
  const estimado = pulv ? climaNaHora(clima, sede?.id, new Date(quando)) : undefined
  const preencher = () => {
    if (!estimado) return
    if (!temp && estimado.temperatura_c != null) setTemp(String(estimado.temperatura_c).replace('.', ','))
    if (!umid && estimado.umidade_pct != null) setUmid(String(Math.round(estimado.umidade_pct)))
    if (!vento && estimado.vento_kmh != null) setVento(String(estimado.vento_kmh).replace('.', ','))
  }
  const condicaoRuim = pulv && ((num(vento) ?? 0) > 10 || (num(umid) ?? 100) < 55 || (num(temp) ?? 0) > 30)

  function mudaTalhao(id: string) {
    setTalhaoId(id)
    const t = talhoes.find((x) => x.id === id)
    if (t && !area) setArea(String(t.area_ha).replace('.', ','))
  }
  const mudaProd = (i: number, p: Partial<LinhaProduto>) => setProdutos(produtos.map((x, j) => (j === i ? { ...x, ...p } : x)))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!talhaoId || !tipo) return
    const id = uuid()
    const ciclo = cicloAtual(talhaoId, ciclos)
    const prods: OperacaoProduto[] = produtos
      .filter((p) => p.insumo_id && num(p.dose))
      .map((p) => {
        const ins = insumos.find((x) => x.id === p.insumo_id)!
        const dose = num(p.dose)!
        return { id: p.id, operacao_id: id, insumo_id: p.insumo_id, dose_ha: dose, unidade: ins.unidade, quantidade_total: areaNum ? dose * areaNum : null }
      })
    await salvarOperacao({
      id, data_hora: new Date(quando).toISOString(), autor_id: eu.id, talhao_id: talhaoId,
      ciclo_id: ciclo?.status === 'Em andamento' ? ciclo.id : null, tipo,
      area_ha: areaNum, horas: num(horas), alvo: alvo || null,
      volume_calda_l_ha: pulv ? num(calda) : null, temperatura_c: pulv ? num(temp) : null,
      umidade_pct: pulv ? num(umid) : null, vento_kmh: pulv ? num(vento) : null,
      receituario: receita || null, observacao: obs || null,
      latitude: pos?.p[0] ?? null, longitude: pos?.p[1] ?? null,
    }, prods)
    setSalvo(true)
    setTimeout(pronto, 900)
  }

  if (salvo) return <div className="tela"><Aviso tipo="ok">Operação salva. ✔</Aviso></div>

  return (
    <form className="tela" onSubmit={enviar}>
      <h1>Operação</h1>
      <SeletorTalhao valor={talhaoId} muda={mudaTalhao} />
      <Escolha t="O que foi feito" opcoes={TIPOS_OPERACAO} valor={tipo} muda={setTipo} />
      <div className="duas">
        <Rotulo t="Quando"><input type="datetime-local" required value={quando} onChange={(e) => setQuando(e.target.value)} /></Rotulo>
        <Rotulo t="Área feita (ha)" dica={talhao ? `Talhão tem ${fmtN(Number(talhao.area_ha), 2)} ha` : undefined}>
          <input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
        </Rotulo>
      </div>

      {(USA_PRODUTO.includes(tipo) || produtos.length > 0) && (
        <fieldset>
          <legend>{pulv ? 'Produtos da calda' : 'Insumos usados'}</legend>
          {produtos.map((p, i) => {
            const ins = insumos.find((x) => x.id === p.insumo_id)
            const total = ins && num(p.dose) && areaNum ? num(p.dose)! * areaNum : null
            return (
              <div className="produto" key={p.id}>
                <select value={p.insumo_id} onChange={(e) => mudaProd(i, { insumo_id: e.target.value })} aria-label="Insumo">
                  <option value="">Insumo…</option>
                  {insumos.filter((x) => x.ativo !== false).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                <input inputMode="decimal" placeholder={`Dose ${ins?.unidade ?? ''}/ha`} value={p.dose} onChange={(e) => mudaProd(i, { dose: e.target.value })} aria-label="Dose por hectare" />
                <button type="button" className="mini" onClick={() => setProdutos(produtos.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
                {total != null && <small className="dica">Total: {fmtN(total, 2)} {ins?.unidade} · sai do estoque</small>}
              </div>
            )
          })}
          <button type="button" className="secundario" onClick={() => setProdutos([...produtos, { id: uuid(), insumo_id: '', dose: '' }])}>+ Produto</button>
          {insumos.length === 0 && <small className="dica">Nenhum insumo cadastrado ainda (Mais › Insumos).</small>}
        </fieldset>
      )}

      {pulv && (
        <fieldset>
          <legend>Aplicação</legend>
          <Rotulo t="Alvo"><input value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="Ex.: percevejo, ferrugem" /></Rotulo>
          <div className="quatro">
            <Rotulo t="Calda L/ha"><input inputMode="decimal" value={calda} onChange={(e) => setCalda(e.target.value)} /></Rotulo>
            <Rotulo t="Temp. °C"><input inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} /></Rotulo>
            <Rotulo t="Umidade %"><input inputMode="decimal" value={umid} onChange={(e) => setUmid(e.target.value)} /></Rotulo>
            <Rotulo t="Vento km/h"><input inputMode="decimal" value={vento} onChange={(e) => setVento(e.target.value)} /></Rotulo>
          </div>
          {estimado && (!temp || !umid || !vento) && (
            <button type="button" className="secundario" onClick={preencher}>
              Usar clima estimado da sede {sede?.nome}: {estimado.temperatura_c} °C · {Math.round(Number(estimado.umidade_pct))}% · {estimado.vento_kmh} km/h
            </button>
          )}
          {condicaoRuim && <Aviso tipo="alerta">Condição fora da faixa recomendada (vento até 10 km/h, umidade acima de 55%, temperatura até 30 °C).</Aviso>}
          <Rotulo t="Receituário"><input value={receita} onChange={(e) => setReceita(e.target.value)} /></Rotulo>
        </fieldset>
      )}

      <div className="duas">
        <Rotulo t="Horas de máquina"><input inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} /></Rotulo>
        {!pulv && <Rotulo t="Alvo / detalhe"><input value={alvo} onChange={(e) => setAlvo(e.target.value)} /></Rotulo>}
      </div>
      <Rotulo t="Observação"><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Rotulo>
      <button className="primario fixo" disabled={!talhaoId || !tipo}>Salvar operação</button>
    </form>
  )
}
