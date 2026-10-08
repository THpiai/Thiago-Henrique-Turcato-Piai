import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao, useGps } from '../lib/hooks'
import { CULTURAS, TIPOS_OPERACAO } from '../lib/opcoes'
import { agoraLocal, fmtN, num, uuid } from '../lib/formato'
import { climaNaHora, sedeDoTalhao } from '../lib/painel'
import { cicloAberto, nomeSafra, diaLocal, TIPOS_COLHEITA } from '../lib/safra'
import { doseMercado, referenciaCultura, referenciaInsumo } from '../lib/mercado'
import { salvarOperacao } from '../lib/sync'
import { Aviso, Escolha, Rotulo, SeletorTalhao } from '../components/ui'
import type { Ciclo, OperacaoProduto } from '../lib/tipos'

type LinhaProduto = { id: string; insumo_id: string; dose: string }
const USA_PRODUTO = ['Plantio', 'Pulverização', 'Adubação', 'Calagem e gessagem']

export function FormOperacao({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  const { pos } = useGps()
  const insumos = useLive(() => db.insumos.orderBy('nome').toArray()) ?? []
  const talhoes = useLive(() => db.talhoes.toArray()) ?? []
  const ciclos = (useLive(() => db.ciclos.toArray()) ?? []).filter((c) => !c.excluido_em)
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
  const [cultura, setCultura] = useState('')
  const [cultivar, setCultivar] = useState('')
  const [populacao, setPopulacao] = useState('')
  const [producao, setProducao] = useState('')
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
  const aberto = talhaoId ? cicloAberto(talhaoId, ciclos) : undefined
  const plantio = tipo === 'Plantio'
  const colheita = TIPOS_COLHEITA.includes(tipo)
  const culturaFinal = aberto?.cultura ?? cultura
  const refCult = culturaFinal ? referenciaCultura(culturaFinal, aberto?.safra ?? nomeSafra(culturaFinal, quando.slice(0, 10))) : undefined
  const unProd: 'sc' | 't' = aberto?.cultura === 'Cana-de-açúcar' || tipo === 'Corte de cana' ? 't' : 'sc'
  const prodEsperada = colheita && areaNum && (aberto?.meta_por_ha ?? refCult?.produtividade_ha)
    ? Math.round(areaNum * (aberto?.meta_por_ha ?? refCult!.produtividade_ha!)) : null
  const condicaoRuim = pulv && ((num(vento) ?? 0) > 10 || (num(umid) ?? 100) < 55 || (num(temp) ?? 0) > 30)

  function mudaTalhao(id: string) {
    setTalhaoId(id)
    const t = talhoes.find((x) => x.id === id)
    // Troca a área junto com o talhão, a menos que a pessoa já tenha digitado outra.
    const anterior = talhoes.find((x) => x.id === talhaoId)
    const doAnterior = anterior && num(area) === Number(anterior.area_ha)
    if (t && (!area || doAnterior)) setArea(String(t.area_ha).replace('.', ','))
  }
  const mudaProd = (i: number, p: Partial<LinhaProduto>) => setProdutos(produtos.map((x, j) => (j === i ? { ...x, ...p } : x)))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!talhaoId || !tipo) return
    const id = uuid()
    const criaSafra = plantio && !aberto && !!cultura
    const cicloId = aberto?.id ?? (criaSafra ? uuid() : null)
    const dataHora = new Date(quando).toISOString()
    const novaSafra: Ciclo | undefined = criaSafra ? {
      id: cicloId!, talhao_id: talhaoId, safra: nomeSafra(cultura, diaLocal(dataHora)), cultura, cultivar: cultivar || null,
      populacao_plantas_ha: num(populacao), data_plantio: diaLocal(dataHora), status: 'Em andamento',
    } : undefined
    const prods: OperacaoProduto[] = produtos
      .filter((p) => p.insumo_id && num(p.dose))
      .map((p) => {
        const ins = insumos.find((x) => x.id === p.insumo_id)!
        const dose = num(p.dose)!
        return { id: p.id, operacao_id: id, insumo_id: p.insumo_id, dose_ha: dose, unidade: ins.unidade, quantidade_total: areaNum ? dose * areaNum : null }
      })
    await salvarOperacao({
      id, data_hora: dataHora, autor_id: eu.id, talhao_id: talhaoId, ciclo_id: cicloId, tipo,
      cultura: plantio ? culturaFinal || null : null, cultivar: plantio ? cultivar || null : null,
      populacao_plantas_ha: plantio ? num(populacao) : null,
      producao: colheita ? num(producao) : null, unidade_producao: colheita && num(producao) != null ? unProd : null,
      area_ha: areaNum, horas: num(horas), alvo: alvo || null,
      volume_calda_l_ha: pulv ? num(calda) : null, temperatura_c: pulv ? num(temp) : null,
      umidade_pct: pulv ? num(umid) : null, vento_kmh: pulv ? num(vento) : null,
      receituario: receita || null, observacao: obs || null,
      latitude: pos?.p[0] ?? null, longitude: pos?.p[1] ?? null,
    }, prods, novaSafra)
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

      {talhao && tipo && (
        <p className="liga-safra">
          {aberto ? <>Entra na safra <b>{aberto.safra} · {aberto.cultura}</b>{aberto.status === 'Planejado' && plantio ? ' e ela passa para "em andamento"' : ''}.</>
            : plantio ? <>Este talhão não tem safra aberta. Escolha a cultura e a safra é criada sozinha.</>
            : <>Este talhão não tem safra aberta. A operação fica só na linha do tempo do talhão.</>}
        </p>
      )}

      {plantio && (
        <fieldset>
          <legend>Safra</legend>
          {!aberto && <Escolha t="Cultura" opcoes={CULTURAS} valor={cultura as (typeof CULTURAS)[number]} muda={setCultura} />}
          <div className="duas">
            <Rotulo t="Cultivar / variedade"><input value={cultivar} onChange={(e) => setCultivar(e.target.value)} placeholder={aberto?.cultivar ?? ''} /></Rotulo>
            {culturaFinal !== 'Cana-de-açúcar' && (
              <Rotulo t="População (plantas/ha)" dica={refCult?.populacao_ha ? `(padrão mercado: ${fmtN(refCult.populacao_ha)})` : undefined}>
                <input inputMode="numeric" value={populacao} onChange={(e) => setPopulacao(e.target.value)} placeholder={refCult?.populacao_ha ? `(${fmtN(refCult.populacao_ha)})` : ''} />
              </Rotulo>
            )}
          </div>
          {refCult?.populacao_ha && !populacao && culturaFinal !== 'Cana-de-açúcar' && (
            <button type="button" className="mercado" onClick={() => setPopulacao(String(refCult.populacao_ha))}>Usar padrão mercado: {fmtN(refCult.populacao_ha)} plantas/ha</button>
          )}
        </fieldset>
      )}

      {colheita && (
        <fieldset>
          <legend>Produção colhida</legend>
          <Rotulo t={`Produção desta área (${unProd})`} dica="Soma na safra. Com 95% da área colhida, a safra fecha sozinha.">
            <input inputMode="decimal" value={producao} onChange={(e) => setProducao(e.target.value)} placeholder={prodEsperada ? `(esperado ${fmtN(prodEsperada)} ${unProd})` : ''} />
          </Rotulo>
          {prodEsperada != null && <small className="dica">({aberto?.meta_por_ha ? 'pela meta' : 'padrão mercado'}: {fmtN(aberto?.meta_por_ha ?? refCult?.produtividade_ha, 1)} {unProd}/ha × {fmtN(areaNum, 2)} ha)</small>}
        </fieldset>
      )}

      {(USA_PRODUTO.includes(tipo) || produtos.length > 0) && (
        <fieldset>
          <legend>{pulv ? 'Produtos da calda' : 'Insumos usados'}</legend>
          {produtos.map((p, i) => {
            const ins = insumos.find((x) => x.id === p.insumo_id)
            const total = ins && num(p.dose) && areaNum ? num(p.dose)! * areaNum : null
            const ref = referenciaInsumo(ins?.nome)
            const padrao = ins?.dose_ha_padrao != null ? `${fmtN(Number(ins.dose_ha_padrao), 3)} ${ins.unidade}/ha` : doseMercado(ref)
            return (
              <div className="produto" key={p.id}>
                <select value={p.insumo_id} onChange={(e) => mudaProd(i, { insumo_id: e.target.value })} aria-label="Insumo">
                  <option value="">Insumo…</option>
                  {insumos.filter((x) => x.ativo !== false).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                <input inputMode="decimal" placeholder={padrao ? `(${padrao})` : `Dose ${ins?.unidade ?? ''}/ha`} value={p.dose} onChange={(e) => mudaProd(i, { dose: e.target.value })} aria-label="Dose por hectare" />
                <button type="button" className="mini" onClick={() => setProdutos(produtos.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
                {total != null && <small className="dica">Total: {fmtN(total, 2)} {ins?.unidade} · sai do estoque</small>}
                {total == null && padrao && <small className="dica">({ins?.dose_ha_padrao != null ? 'dose cadastrada' : 'padrão mercado, bula'}: {padrao})</small>}
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
      <button className="primario fixo" disabled={!talhaoId || !tipo || (plantio && !aberto && !cultura)}>Salvar operação</button>
    </form>
  )
}
