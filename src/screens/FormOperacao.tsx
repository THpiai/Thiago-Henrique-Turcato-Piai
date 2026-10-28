import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useDados, useGravar, useIds, useLive, useSessao, useTalhaoGps } from '../lib/hooks'
import { CULTURAS, TIPOS_OPERACAO } from '../lib/opcoes'
import { agoraLocal, fmtN, num, uuid } from '../lib/formato'
import { climaNaHora, resumoTalhao, sedeDoTalhao } from '../lib/painel'
import { cicloAberto, grupoSafra, nomeSafra, diaLocal, TIPOS_COLHEITA } from '../lib/safra'
import { situacaoNoMapa } from '../lib/operacoes'
import { naSelecao, useSelecao } from '../lib/filtro'
import { doseMercado, referenciaCultura, referenciaInsumo } from '../lib/mercado'
import { salvarOperacoes } from '../lib/sync'
import { Aviso, Escolha, Rotulo } from '../components/ui'
import { SeletorTalhoes } from '../components/SeletorTalhoes'
import { MapaOperacao } from '../components/MapaOperacao'
import type { Ciclo, Operacao, OperacaoProduto, Sobra } from '../lib/tipos'

type LinhaProduto = { id: string; insumo_id: string; dose: string }
type LinhaSobra = { id: string; talhao_id: string; cultivar: string; sementes: string; area: string }
const USA_PRODUTO = ['Plantio', 'Pulverização', 'Adubação', 'Calagem e gessagem']
const SITUACOES = ['Terminou', 'Ainda em andamento'] as const

export function FormOperacao({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  // Um GPS só para o formulário todo: sugere o talhão e grava o ponto da operação.
  const gps = useTalhaoGps()
  const { pos } = gps
  const d = useDados()
  const insumos = (useLive(() => db.insumos.orderBy('nome').toArray()) ?? []).filter((x) => !x.excluido_em)
  const inativos = insumos.filter((x) => x.ativo === false)
  const clima = useLive(() => db.clima.toArray()) ?? []
  const talhoes = useMemo(() => d?.talhoes ?? [], [d])
  const ciclos = useMemo(() => (d?.ciclos ?? []).filter((c) => !c.excluido_em), [d])
  const sedes = d?.sedes ?? []
  const resumos = useMemo(() => (d ? d.talhoes.map((t) => resumoTalhao(t, d)) : []), [d])
  const [filtro] = useSelecao()
  const [marcados, setMarcados] = useState<string[]>([])
  const [tipo, setTipo] = useState<string>('')
  const [situacao, setSituacao] = useState<(typeof SITUACOES)[number]>('Terminou')
  const [quando, setQuando] = useState(agoraLocal())
  const [variosDias, setVariosDias] = useState(false)
  const [fim, setFim] = useState('')
  const [areas, setAreas] = useState<Record<string, string>>({})
  const [producoes, setProducoes] = useState<Record<string, string>>({})
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
  const [sobras, setSobras] = useState<LinhaSobra[]>([])
  const [salvo, setSalvo] = useState(0)
  // Ids fixos desde que o formulário abriu: tocar Salvar de novo grava por cima, não duplica.
  const idDe = useIds()
  const { salvando, gravar } = useGravar()

  const escolhidos = marcados.map((id) => talhoes.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t)
  const primeiro = escolhidos[0]
  const varios = escolhidos.length > 1
  const aberta = situacao === 'Ainda em andamento'
  const areaDe = (id: string) => num(areas[id]) ?? Number(talhoes.find((t) => t.id === id)?.area_ha ?? 0)
  const areaTotal = escolhidos.reduce((s, t) => s + areaDe(t.id), 0)
  const pulv = tipo === 'Pulverização'
  const sede = primeiro ? sedeDoTalhao(primeiro, sedes) : undefined
  const estimado = pulv ? climaNaHora(clima, sede?.id, new Date(quando)) : undefined
  const preencher = () => {
    if (!estimado) return
    if (!temp && estimado.temperatura_c != null) setTemp(String(estimado.temperatura_c).replace('.', ','))
    if (!umid && estimado.umidade_pct != null) setUmid(String(Math.round(estimado.umidade_pct)))
    if (!vento && estimado.vento_kmh != null) setVento(String(estimado.vento_kmh).replace('.', ','))
  }
  const abertoDe = (id: string) => cicloAberto(id, ciclos)
  const plantio = tipo === 'Plantio'
  const colheita = TIPOS_COLHEITA.includes(tipo)
  const semSafra = escolhidos.filter((t) => !abertoDe(t.id))
  const aberto1 = primeiro ? abertoDe(primeiro.id) : undefined
  const culturaFinal = aberto1?.cultura ?? cultura
  const refCult = culturaFinal ? referenciaCultura(culturaFinal, aberto1?.safra ?? nomeSafra(culturaFinal, quando.slice(0, 10))) : undefined
  const unProd = (id: string): 'sc' | 't' => abertoDe(id)?.cultura === 'Cana-de-açúcar' || tipo === 'Corte de cana' ? 't' : 'sc'
  const esperado = (id: string) => {
    const c = abertoDe(id)
    const ref = c ? referenciaCultura(c.cultura, c.safra) : undefined
    const porHa = c?.meta_por_ha ?? ref?.produtividade_ha
    return colheita && porHa ? Math.round(areaDe(id) * porHa) : null
  }
  const condicaoRuim = pulv && ((num(vento) ?? 0) > 10 || (num(umid) ?? 100) < 55 || (num(temp) ?? 0) > 30)

  // Mapa: talhões dentro do filtro do app, mais os marcados aqui.
  const noMapa = useMemo(() => talhoes.filter((t) => naSelecao(filtro, t.id) || marcados.includes(t.id)), [talhoes, filtro, marcados])
  const sitMapa = useMemo(() => (tipo && d ? situacaoNoMapa(noMapa, d.operacoes, ciclos, tipo, marcados) : null), [tipo, d, noMapa, ciclos, marcados])
  const resumosFiltro = useMemo(() => resumos.filter((r) => naSelecao(filtro, r.talhao.id) || marcados.includes(r.talhao.id)), [resumos, filtro, marcados])

  const mudaMarcados = useCallback((ids: string[]) => setMarcados(ids), [])
  const alterna = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const mudaProd = (i: number, p: Partial<LinhaProduto>) => setProdutos(produtos.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const mudaSobra = (i: number, p: Partial<LinhaSobra>) => setSobras(sobras.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const fimIso = !aberta && variosDias && fim ? new Date(fim).toISOString() : null
  const fimAntes = !!fimIso && new Date(fim).getTime() < new Date(quando).getTime()
  const podeSalvar = escolhidos.length > 0 && !!tipo && !(plantio && semSafra.length > 0 && !cultura) && !fimAntes

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!podeSalvar) return
    const dataHora = new Date(quando).toISOString()
    const lote = varios ? idDe('lote') : null
    const ops: Operacao[] = [], prods: OperacaoProduto[] = [], novas: Ciclo[] = []
    for (const t of escolhidos) {
      const id = idDe(`op:${t.id}`)
      const ab = abertoDe(t.id)
      const criaSafra = plantio && !ab && !!cultura
      const cicloId = ab?.id ?? (criaSafra ? idDe(`safra:${t.id}`) : null)
      const cult = ab?.cultura ?? cultura
      if (criaSafra) novas.push({
        id: cicloId!, talhao_id: t.id, safra: nomeSafra(cultura, diaLocal(dataHora)), cultura, cultivar: cultivar || null,
        populacao_plantas_ha: num(populacao), data_plantio: diaLocal(dataHora), status: 'Em andamento',
      })
      const area = areaDe(t.id) || null
      for (const p of produtos) {
        const ins = insumos.find((x) => x.id === p.insumo_id)
        const dose = num(p.dose)
        if (!ins || !dose) continue
        prods.push({ id: idDe(`prod:${t.id}:${p.id}`), operacao_id: id, insumo_id: ins.id, dose_ha: dose, unidade: ins.unidade, quantidade_total: area ? dose * area : null })
      }
      const minhas: Sobra[] = plantio ? sobras.filter((s) => s.cultivar.trim() && (s.talhao_id === t.id || (!varios && !s.talhao_id)))
        .map((s) => ({ cultivar: s.cultivar.trim(), sementes: s.sementes.trim() || null, area_ha: num(s.area) })) : []
      const prod = colheita && !aberta ? num(producoes[t.id]) : null
      ops.push({
        id, data_hora: dataHora, autor_id: eu.id, talhao_id: t.id, ciclo_id: cicloId, tipo,
        em_andamento: aberta, data_fim: fimIso, lote_id: lote, sobras: minhas.length ? minhas : null,
        cultura: plantio ? cult || null : null, cultivar: plantio ? cultivar || null : null,
        populacao_plantas_ha: plantio ? num(populacao) : null,
        producao: prod, unidade_producao: prod != null ? unProd(t.id) : null,
        area_ha: area, horas: num(horas), alvo: alvo || null,
        volume_calda_l_ha: pulv ? num(calda) : null, temperatura_c: pulv ? num(temp) : null,
        umidade_pct: pulv ? num(umid) : null, vento_kmh: pulv ? num(vento) : null,
        receituario: receita || null, observacao: obs || null,
        latitude: pos?.p[0] ?? null, longitude: pos?.p[1] ?? null,
      })
    }
    if (!(await gravar(() => salvarOperacoes(ops, prods, novas)))) return
    setSalvo(ops.length)
    setTimeout(pronto, 1100)
  }

  if (salvo) return (
    <div className="tela"><Aviso tipo="ok">{salvo > 1 ? `${salvo} operações salvas, uma por talhão.` : 'Operação salva.'}{aberta ? ' Ela fica em andamento até você marcar que terminou.' : ''} ✔</Aviso></div>
  )

  return (
    <div className="tela tela-operacao">
      <MapaOperacao talhoes={noMapa} marcados={marcados} situacao={sitMapa} alterna={alterna} tipo={tipo} />
      <form className="form-operacao" onSubmit={enviar}>
        <h1>Operação</h1>
        {d && <SeletorTalhoes resumos={resumosFiltro} d={d} marcados={marcados} muda={mudaMarcados} gps={gps} />}
        <Escolha t="O que foi feito" opcoes={TIPOS_OPERACAO} valor={tipo} muda={setTipo} />
        {tipo && (
          <Escolha t="Situação" opcoes={SITUACOES} valor={situacao} muda={setSituacao}
            dica={aberta ? 'Fica "em andamento" no talhão e no Início. Os insumos já saem do estoque; ao terminar, você confirma a área feita.' : undefined} />
        )}
        <div className="duas">
          <Rotulo t={aberta ? 'Começou em' : variosDias ? 'Começou em' : 'Quando'}>
            <input type="datetime-local" required value={quando} onChange={(e) => setQuando(e.target.value)} />
          </Rotulo>
          {!aberta && variosDias ? (
            <Rotulo t="Terminou em" dica={fimAntes ? 'O término ficou antes do início.' : undefined}>
              <input type="datetime-local" value={fim} min={quando} onChange={(e) => setFim(e.target.value)} />
            </Rotulo>
          ) : !aberta ? (
            <div className="campo"><span className="rotulo">&nbsp;</span>
              <button type="button" className="link" onClick={() => { setVariosDias(true); setFim(agoraLocal()) }}>+ Durou mais de um dia</button>
            </div>
          ) : null}
        </div>

        {escolhidos.length > 0 && (
          <fieldset className="por-talhao">
            <legend>{varios ? `Área em cada talhão · ${fmtN(areaTotal, 2)} ha no total` : 'Área feita'}</legend>
            {escolhidos.map((t) => {
              const ab = abertoDe(t.id)
              const esp = esperado(t.id)
              return (
                <div className="linha-talhao-op" key={t.id}>
                  <div className="nome">
                    <b>{t.nome}</b>
                    <small>{ab ? `${grupoSafra(ab)} · ${ab.cultura}` : plantio ? (cultura ? `nova safra de ${cultura}` : 'sem safra: escolha a cultura') : 'sem safra aberta: fica só na linha do tempo'}</small>
                  </div>
                  <label className="campo-mini">
                    <span>ha {aberta ? 'planejados' : 'feitos'}</span>
                    <input inputMode="decimal" aria-label={`Área em ${t.nome} (ha)`} value={areas[t.id] ?? String(t.area_ha).replace('.', ',')}
                      onChange={(e) => setAreas({ ...areas, [t.id]: e.target.value })} />
                  </label>
                  {colheita && !aberta && (
                    <label className="campo-mini">
                      <span>produção ({unProd(t.id)})</span>
                      <input inputMode="decimal" aria-label={`Produção em ${t.nome}`} value={producoes[t.id] ?? ''} placeholder={esp ? `(esp. ${fmtN(esp)})` : ''}
                        onChange={(e) => setProducoes({ ...producoes, [t.id]: e.target.value })} />
                    </label>
                  )}
                </div>
              )
            })}
            {colheita && !aberta && <small className="dica">A produção soma na safra. Com 95% da área colhida, a safra fecha sozinha.</small>}
            {colheita && aberta && <small className="dica">A produção é informada quando a colheita terminar. Enquanto estiver em andamento, a safra não fecha.</small>}
          </fieldset>
        )}

        {plantio && escolhidos.length > 0 && (
          <fieldset>
            <legend>Safra e variedade</legend>
            {semSafra.length > 0 && (
              <Escolha t={varios && semSafra.length < escolhidos.length ? `Cultura (para ${semSafra.map((t) => t.nome).join(', ')})` : 'Cultura'}
                opcoes={CULTURAS} valor={cultura as (typeof CULTURAS)[number]} muda={setCultura} />
            )}
            <div className="duas">
              <Rotulo t="Variedade principal"><input value={cultivar} onChange={(e) => setCultivar(e.target.value)} placeholder={aberto1?.cultivar ?? ''} /></Rotulo>
              {culturaFinal !== 'Cana-de-açúcar' && (
                <Rotulo t="População (plantas/ha)" dica={refCult?.populacao_ha ? `(padrão mercado: ${fmtN(refCult.populacao_ha)})` : undefined}>
                  <input inputMode="numeric" value={populacao} onChange={(e) => setPopulacao(e.target.value)} placeholder={refCult?.populacao_ha ? `(${fmtN(refCult.populacao_ha)})` : ''} />
                </Rotulo>
              )}
            </div>
            {refCult?.populacao_ha && !populacao && culturaFinal !== 'Cana-de-açúcar' && (
              <button type="button" className="mercado" onClick={() => setPopulacao(String(refCult.populacao_ha))}>Usar padrão mercado: {fmtN(refCult.populacao_ha)} plantas/ha</button>
            )}
            {sobras.map((x, i) => (
              <div className="sobra" key={x.id}>
                <span className="rotulo">Também entrou</span>
                {varios && (
                  <select value={x.talhao_id} onChange={(e) => mudaSobra(i, { talhao_id: e.target.value })} aria-label="Em qual talhão">
                    <option value="">Talhão…</option>
                    {escolhidos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                )}
                <input value={x.cultivar} placeholder="Outra variedade" aria-label="Outra variedade" onChange={(e) => mudaSobra(i, { cultivar: e.target.value })} />
                <input value={x.sementes} placeholder="Semente (ex.: 3 bags)" aria-label="Quantidade de semente" maxLength={60} onChange={(e) => mudaSobra(i, { sementes: e.target.value })} />
                <input value={x.area} inputMode="decimal" placeholder="≈ ha (opcional)" aria-label="Área aproximada (ha)" onChange={(e) => mudaSobra(i, { area: e.target.value })} />
                <button type="button" className="mini" onClick={() => setSobras(sobras.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
              </div>
            ))}
            {sobras.length < 5 && (
              <button type="button" className="secundario" onClick={() => setSobras([...sobras, { id: uuid(), talhao_id: varios ? '' : primeiro!.id, cultivar: '', sementes: '', area: '' }])}>
                + Também entrou outra variedade (sobra)
              </button>
            )}
            {sobras.length > 0 && <small className="dica">A produtividade continua sendo do talhão; a sobra fica registrada no histórico. Medidas são opcionais.</small>}
          </fieldset>
        )}

        {(USA_PRODUTO.includes(tipo) || produtos.length > 0) && (
          <fieldset>
            <legend>{pulv ? 'Produtos da calda' : 'Insumos usados'}{varios ? ' (mesma dose em todos)' : ''}</legend>
            {produtos.map((p, i) => {
              const ins = insumos.find((x) => x.id === p.insumo_id)
              const total = ins && num(p.dose) && areaTotal ? num(p.dose)! * areaTotal : null
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
                  {total != null && <small className="dica">Total: {fmtN(total, 2)} {ins?.unidade}{varios ? ` em ${escolhidos.length} talhões` : ''} · sai do estoque</small>}
                  {total == null && padrao && <small className="dica">({ins?.dose_ha_padrao != null ? 'dose cadastrada' : 'padrão mercado, bula'}: {padrao})</small>}
                </div>
              )
            })}
            <button type="button" className="secundario" onClick={() => setProdutos([...produtos, { id: uuid(), insumo_id: '', dose: '' }])}>+ Produto</button>
            {insumos.length === 0 && <small className="dica">Nenhum insumo cadastrado ainda (Mais › Insumos).</small>}
            {inativos.length > 0 && <small className="dica">Não achou? Fora de uso (não aparecem aqui): {inativos.map((x) => x.nome).join(', ')}. Para voltar, abra em Mais › Insumos e marque "Em uso".</small>}
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
        <button className="primario fixo" disabled={!podeSalvar || salvando}>
          {salvando ? 'Salvando…' : varios ? `Salvar em ${escolhidos.length} talhões` : aberta ? 'Salvar e deixar em andamento' : 'Salvar operação'}
        </button>
      </form>
    </div>
  )
}
