import { useEffect, useMemo, useState } from 'react'
import { useDados, useLive, useSessao } from '../lib/hooks'
import { resumoTalhao, sedeDoTalhao, type Resumo } from '../lib/painel'
import type { Ciclo, Operacao } from '../lib/tipos'
import { grupoSafra, type estadioDaSafra } from '../lib/safra'
import { gravidade, nomeProblema, type Problema } from '../lib/problemas'
import { ESTADIOS_CANA, ESTADIOS_GRAOS } from '../lib/opcoes'
import { uuid } from '../lib/formato'
import { salvar } from '../lib/sync'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { fmtData, fmtDataHora, fmtN } from '../lib/formato'
import { alterar, apagar, restaurar } from '../lib/sync'
import type { TabelaSync } from '../lib/db'
import { BotaoApagar, mostrarDesfazer } from '../components/Apagar'
import { EmAndamento } from '../components/EmAndamento'
import { condicaoAplicacao, duracaoDias, fichaSafra, operacoesDaSafra, TIPOS_APLICACAO } from '../lib/operacoes'
import type { OperacaoProduto } from '../lib/tipos'
import { diasDesde } from '../lib/formato'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { faixaDoPeriodo, naFaixa, rotuloPeriodo, usePeriodo } from '../lib/periodo'
import { atividade, opsNaFaixa } from '../lib/rendimento'
import { chuvaEntre } from '../lib/painel'

type Evento = { id: string; quando: string; titulo: string; detalhe?: string; tipo: 'op' | 'campo' | 'chuva'; tabela: TabelaSync; autor?: string | null; pendente?: boolean }

const NOME: Record<string, string> = { op: 'Operação', campo: 'Problema', chuva: 'Leitura de chuva' }

export function TalhaoDetalhe({ id, voltar, editarCiclo }: { id: string; voltar: () => void; editarCiclo: (talhaoId: string, cicloId?: string) => void }) {
  const d = useDados()
  const { gestor, eu } = useSessao()
  const insumos = useLive(() => db.insumos.toArray()) ?? []
  const t = d?.talhoes.find((x) => x.id === id)
  const r = useMemo(() => (d && t ? resumoTalhao(t, d) : null), [d, t])
  const [periodo] = usePeriodo()
  if (!d || !t || !r) return <p className="vazio">Carregando…</p>
  const faixa = faixaDoPeriodo(periodo)
  const nomeInsumo = (i: string) => insumos.find((x) => x.id === i)?.nome ?? 'insumo'
  const sedeId = sedeDoTalhao(t, d.sedes)?.id

  const eventos: Evento[] = [
    ...d.operacoes.filter((o) => o.talhao_id === id).map((o) => ({
      id: o.id, quando: o.data_hora, tipo: 'op' as const, tabela: 'operacoes' as const, autor: o.autor_id, pendente: o._pendente === 1,
      titulo: o.tipo + (o.alvo ? ` · ${o.alvo}` : '') + (o.em_andamento ? ' · em andamento' : o.data_fim && duracaoDias(o) > 1 ? ` · ${duracaoDias(o)} dias (até ${fmtData(o.data_fim)})` : ''),
      detalhe: [o.sobras?.length ? `também entrou: ${o.sobras.map((x) => x.cultivar).join(', ')}` : '', TIPOS_APLICACAO.includes(o.tipo) ? textoCondicao(o) : ''].filter(Boolean).concat(d.produtos.filter((p) => p.operacao_id === o.id).map((p) => `${nomeInsumo(p.insumo_id)} ${fmtN(p.dose_ha, 2)} ${p.unidade}/ha`).join(' + ') || o.observacao || '').filter(Boolean).join(' · ') || undefined,
    })),
    ...d.campo.filter((c) => c.talhao_id === id).map((c) => ({
      id: c.id, quando: c.data_hora, tipo: 'campo' as const, tabela: 'campo' as const, autor: c.autor_id, pendente: c._pendente === 1,
      titulo: `${c.tipo}${c.alvo ? ` · ${c.alvo}` : ''} — ${gravidade(c).toLowerCase()}${c.status === 'Resolvida' ? ', resolvido' : ''}`,
      detalhe: [c.quem_viu && c.quem_viu !== 'Equipe' ? `visto pelo ${c.quem_viu.toLowerCase()}` : '', c.nivel_encontrado != null ? `${fmtN(c.nivel_encontrado, 2)} ${c.unidade_nivel ?? ''}` : '', c.descricao].filter(Boolean).join(' · ') || undefined,
    })),
    ...d.chuva.filter((c) => c.talhao_id === id || (!c.talhao_id && c.fonte === 'Pluviômetro' && !!c.sede_id && c.sede_id === sedeId)).map((c) => ({
      id: c.id, quando: c.data, tipo: 'chuva' as const, tabela: 'chuva' as const, autor: c.autor_id, pendente: c._pendente === 1,
      titulo: `Chuva ${fmtN(Number(c.milimetros), 1)} mm${c.talhao_id ? '' : ` · pluviômetro da sede ${d.sedes.find((s) => s.id === c.sede_id)?.nome ?? ''}`}`,
    })),
  ].filter((e) => naFaixa(e.quando.slice(0, 10), faixa)).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, faixa ? 300 : 60)
  // Resumo do período: o que foi feito, quanto de insumo entrou e quanto choveu.
  const noPeriodo = faixa ? atividade(opsNaFaixa(d.operacoes.filter((o) => o.talhao_id === id), faixa), d) : null
  const chuvaNoPeriodo = faixa ? chuvaEntre(id, d.chuva, (dia) => dia >= faixa.de && dia <= faixa.ate, sedeId) : null

  const ciclos = d.ciclos.filter((c) => c.talhao_id === id).sort((a, b) => (b.data_plantio ?? b.safra).localeCompare(a.data_plantio ?? a.safra))

  const podeApagar = (e: Evento) => gestor || e.autor === eu.id
  async function apagarEvento(e: Evento) {
    await apagar(e.tabela, [e.id])
    mostrarDesfazer(`${NOME[e.tipo]} apagad${e.tipo === 'campo' ? 'o' : 'a'}`, () => void restaurar(e.tabela, [e.id]))
  }
  async function arquivar() {
    await apagar('talhoes', [id])
    mostrarDesfazer(`${t!.nome} arquivado`, () => void restaurar('talhoes', [id]))
    voltar()
  }

  return (
    <div className="tela">
      <button className="voltar" onClick={voltar}>‹ Voltar</button>
      <h1>{t.nome} <small className="mudo">{fmtN(Number(t.area_ha), 2)} ha{t.pluviometro ? ' · tem pluviômetro' : ''}</small></h1>

      <EstadoSafra r={r} />

      <section className="cartao">
        <h2>Safra atual</h2>
        {r.ciclo ? (
          <dl className="ficha">
            <dt>Safra</dt><dd>{grupoSafra(r.ciclo)}{grupoSafra(r.ciclo).startsWith(r.ciclo.cultura.slice(0, 4)) ? '' : ` · ${r.ciclo.cultura}`}</dd>
            {r.ciclo.cultivar && <><dt>Cultivar</dt><dd>{r.ciclo.cultivar}{r.ciclo.ciclo_cultivar_dias ? ` (${r.ciclo.ciclo_cultivar_dias} dias)` : ''}</dd></>}
            <dt>Plantio</dt><dd>{fmtData(r.ciclo.data_plantio)}{r.dap != null ? ` · ${r.dap} DAP` : ''}</dd>
            {r.ciclo.populacao_plantas_ha && <><dt>População</dt><dd>{fmtN(r.ciclo.populacao_plantas_ha)} plantas/ha</dd></>}
            <dt>Estádio</dt><dd>{r.estadio && r.ciclo.status === 'Em andamento' ? <><Estadio e={r.estadio} /><ConfirmarEstadio talhaoId={id} cicloId={r.ciclo.id} cultura={r.ciclo.cultura} /></> : r.estado.estadio ?? '–'}</dd>
            <dt>Operações</dt><dd>{resumoOps(r.operacoesCiclo)}</dd>
            <dt>Colheita</dt><dd>{r.ciclo.data_colheita ? `colhido em ${fmtData(r.ciclo.data_colheita)}` : r.diasParaColheita != null ? `prevista em ${r.diasParaColheita} dias` : '–'}</dd>
            {r.ciclo.producao != null && <><dt>Produção</dt><dd>{fmtN(r.ciclo.producao, 1)} {r.ciclo.unidade_producao} · <b>{fmtN(r.produtividade, 1)} {r.ciclo.unidade_producao}/ha</b>{r.ciclo.meta_por_ha ? ` (meta ${fmtN(r.ciclo.meta_por_ha, 1)})` : ''}</dd></>}
            {r.ciclo.cultura === 'Cana-de-açúcar' && r.ciclo.atr_kg_t != null && <><dt>ATR</dt><dd>{fmtN(r.ciclo.atr_kg_t, 1)} kg/t{r.ciclo.corte_cana ? ` · ${r.ciclo.corte_cana}º corte` : ''}</dd></>}
            <dt>Insumos</dt><dd>{r.custoHa != null ? `R$ ${fmtN(r.custoHa, 0)}/ha${r.custoEstimado ? ' (parte pelo padrão mercado)' : ''}` : 'sem preço de entrada no estoque'}</dd>
            <dt>Chuva</dt><dd>{fmtN(r.chuva7, 0)} mm em 7 dias · {fmtN(r.chuva30, 0)} mm em 30 dias</dd>
          </dl>
        ) : <p className="mudo">Nenhuma safra cadastrada para este talhão.</p>}
        {gestor && (
          <div className="acoes">
            {r.ciclo && <button className="secundario" onClick={() => editarCiclo(id, r.ciclo!.id)}>Ajustar safra</button>}
            <button className="secundario" onClick={() => editarCiclo(id)}>Nova safra</button>
          </div>
        )}
      </section>

      {r.problemas.length > 0 && <Problemas ps={r.problemas} />}

      <Aplicacoes ops={r.ciclo ? r.operacoesCiclo : d.operacoes.filter((o) => o.talhao_id === id && (diasDesde(o.data_hora) ?? 999) <= 60)}
        produtos={d.produtos} nomeInsumo={nomeInsumo} daSafra={!!r.ciclo} />

      <EmAndamento ops={d.operacoes.filter((o) => o.talhao_id === id)} talhoes={d.talhoes} />

      {ciclos.length > 0 && <FichaTalhao ciclos={ciclos} ops={d.operacoes} area={Number(t.area_ha)} abrir={gestor ? (c) => editarCiclo(id, c) : undefined} />}

      <section>
        <h2>Linha do tempo</h2>
        <div className="filtros"><FiltroPeriodo padrao="Últimos registros" /></div>
        {noPeriodo && (
          <p className="mudo resumo-periodo">
            {rotuloPeriodo(periodo)}: {noPeriodo.operacoes} operações · {fmtN(noPeriodo.ha, 0)} ha · {noPeriodo.aplicacoes} pulverizações · R$ {fmtN(noPeriodo.custo, 0)} em insumos{noPeriodo.custoEstimado ? ' (parte estimada)' : ''} · {fmtN(chuvaNoPeriodo, 0)} mm de chuva
          </p>
        )}
        {eventos.length === 0 ? <p className="mudo">{faixa ? 'Nada registrado no período.' : 'Nada registrado ainda.'}</p> : (
          <ol className="tempo">
            {eventos.map((e) => (
              <li key={e.id} className={e.tipo}>
                <time>{e.quando.length === 10 ? fmtData(e.quando) : fmtDataHora(e.quando)}</time>
                <div>
                  <b>{e.titulo}</b>{e.pendente && <span className="tag">no celular</span>}{e.detalhe && <small>{e.detalhe}</small>}
                  {podeApagar(e) && (
                    <BotaoApagar pergunta={`Apagar ${NOME[e.tipo].toLowerCase()}?`}
                      detalhe={e.tipo === 'op' ? 'Os insumos voltam ao estoque. Dá para restaurar na Lixeira.' : 'Dá para restaurar na Lixeira.'}
                      aoConfirmar={() => void apagarEvento(e)} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {gestor && (
        <section className="zona-perigo">
          <BotaoApagar rotulo="Arquivar talhão" pergunta={`Arquivar ${t.nome}?`}
            detalhe="Some do mapa e do painel. O histórico fica guardado e dá para restaurar na Lixeira."
            aoConfirmar={() => void arquivar()} />
        </section>
      )}
    </div>
  )
}

const fmtC = (o: Operacao) => [o.temperatura_c != null ? `${fmtN(Number(o.temperatura_c), 1)} °C` : '', o.umidade_pct != null ? `UR ${fmtN(Number(o.umidade_pct), 0)}%` : '',
  o.vento_kmh != null ? `vento ${fmtN(Number(o.vento_kmh), 1)} km/h` : ''].filter(Boolean).join(' · ')

function textoCondicao(o: Operacao): string {
  const c = condicaoAplicacao(o)
  if (c.nivel === 'sem-dados') return 'sem condição anotada'
  return `${fmtC(o)} (${c.nivel === 'bom' ? 'dentro da faixa' : 'fora da faixa'})`
}

const ROT_COND = { bom: 'Condição boa', atencao: 'Fora da faixa', 'sem-dados': 'Sem condição' } as const

/** Aplicações da safra (com as feitas antes do plantio): produtos, calda e condição de cada uma frente à faixa recomendada. */
function Aplicacoes({ ops, produtos, nomeInsumo, daSafra }: { ops: Operacao[]; produtos: OperacaoProduto[]; nomeInsumo: (id: string) => string; daSafra: boolean }) {
  const apl = ops.filter((o) => TIPOS_APLICACAO.includes(o.tipo)).sort((a, b) => b.data_hora.localeCompare(a.data_hora))
  const ultima = apl[0] ? diasDesde(apl[0].data_hora) : null
  const fora = apl.filter((o) => condicaoAplicacao(o).nivel === 'atencao').length
  const semProduto = apl.filter((o) => !produtos.some((p) => p.operacao_id === o.id)).length
  return (
    <section className="cartao">
      <h2>Aplicações {daSafra ? 'desta safra' : 'dos últimos 60 dias'}</h2>
      {apl.length === 0 ? <p className="mudo">Nenhuma pulverização registrada{daSafra ? ' nesta safra' : ''}.</p> : <>
        <p className="mudo resumo-apl">
          {apl.length} aplicaç{apl.length === 1 ? 'ão' : 'ões'} · última {ultima === 0 ? 'hoje' : ultima === 1 ? 'ontem' : `há ${ultima} dias`}
          {fora > 0 && <> · <b className="txt-atencao">{fora} fora da faixa</b></>}
          {semProduto > 0 && <> · {semProduto} sem produto lançado</>}
        </p>
        <ul className="lista aplicacoes">
          {apl.map((o) => {
            const c = condicaoAplicacao(o)
            const ps = produtos.filter((p) => p.operacao_id === o.id)
            return (
              <li key={o.id} className={`cond-${c.nivel}`}>
                <div className="cab">
                  <b>{fmtData(o.data_hora)}{o.alvo ? ` · ${o.alvo}` : ''}</b>
                  <span className={`selo ${c.nivel}`}>{ROT_COND[c.nivel]}</span>
                </div>
                <small>{ps.length ? ps.map((p) => `${nomeInsumo(p.insumo_id)} ${fmtN(p.dose_ha, 2)} ${p.unidade}/ha`).join(' + ') : 'Sem produto lançado'}
                  {o.volume_calda_l_ha != null ? ` · calda ${fmtN(Number(o.volume_calda_l_ha), 0)} L/ha` : ''}
                  {o.area_ha != null ? ` · ${fmtN(Number(o.area_ha), 2)} ha` : ''}</small>
                <small>{c.nivel === 'sem-dados' ? 'Temperatura, umidade e vento não anotados.' : fmtC(o)}
                  </small>
                {c.fora.length > 0 && <small className="txt-atencao">Fora da faixa: {c.fora.join(', ')}</small>}
                {o.ciclo_id == null && daSafra && <small className="mudo">Antes do plantio (conta nesta safra)</small>}
              </li>
            )
          })}
        </ul>
        <p className="mudo legenda">Faixa recomendada: vento até 10 km/h, umidade acima de 55% e temperatura até 30 °C.</p>
      </>}
    </section>
  )
}

/** Ficha do talhão por safra: variedade (e sobras), plantio → colheita, dias de ciclo real e produtividade. */
function FichaTalhao({ ciclos, ops, area, abrir }: { ciclos: Ciclo[]; ops: Operacao[]; area: number; abrir?: (cicloId: string) => void }) {
  const fichas = ciclos.map((c) => fichaSafra(c, ops))
  const periodo = (e: { inicio: string; fim: string; dias: number; aberta: boolean } | null) =>
    !e ? '–' : `${fmtData(e.inicio)}${e.dias > 1 || e.aberta ? ` a ${e.aberta ? 'hoje' : fmtData(e.fim)}` : ''} · ${e.dias} dia${e.dias > 1 ? 's' : ''}${e.aberta ? ' (em andamento)' : ''}`
  return (
    <section className="cartao">
      <h2>Ficha do talhão por safra</h2>
      <ol className="ficha-safras">
        {fichas.map((f) => (
          <li key={f.ciclo.id} onClick={abrir ? () => abrir(f.ciclo.id) : undefined} className={abrir ? 'clicavel' : ''}>
            <div className="cab">
              <b>{grupoSafra(f.ciclo)}</b>
              <span className="mudo">{f.ciclo.cultura}{f.ciclo.cultivar ? ` · ${f.ciclo.cultivar}` : ''}</span>
              <span className="selo">{f.ciclo.status === 'Colhido' ? 'Colhida' : f.ciclo.status}</span>
            </div>
            {f.sobras.length > 0 && <small>Com sobra de: {f.sobras.join('; ')}</small>}
            <dl className="ficha">
              <dt>Plantio</dt><dd>{f.plantio ? periodo(f.plantio) : fmtData(f.ciclo.data_plantio)}</dd>
              <dt>Colheita</dt><dd>{f.colheita ? periodo(f.colheita) : f.ciclo.data_colheita ? fmtData(f.ciclo.data_colheita) : '–'}</dd>
              <dt>Ciclo real</dt><dd>{f.diasCiclo != null ? <><b>{f.diasCiclo} dias</b>{f.cicloCompleto ? ' do plantio à colheita' : ' até hoje'}{f.ciclo.ciclo_cultivar_dias ? ` (cultivar: ${f.ciclo.ciclo_cultivar_dias})` : ''}</> : '–'}</dd>
              <dt>Produtividade</dt><dd>{f.ciclo.producao != null && Number(f.ciclo.area_ha ?? area) > 0 ? <><b>{fmtN(f.ciclo.producao / Number(f.ciclo.area_ha ?? area), 1)} {f.ciclo.unidade_producao}/ha</b>{f.ciclo.meta_por_ha ? ` · meta ${fmtN(f.ciclo.meta_por_ha, 1)}` : ''}</> : '–'}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  )
}

const NIVEL_TXT = { bom: 'Em dia', atencao: 'Atenção', critico: 'Crítico', 'sem-dados': 'Sem safra' } as const

/** Conclusão automática sobre a safra, a partir de operações, monitoramento, chuva e estádio. */
export function EstadoSafra({ r }: { r: Resumo }) {
  const e = r.estado
  return (
    <section className={`cartao estado-safra ${e.nivel}`}>
      <div className="topo">
        <h2>Estado da safra</h2>
        <span className={`selo ${e.nivel}`}>{NIVEL_TXT[e.nivel]}</span>
      </div>
      {r.ciclo && r.ciclo.status === 'Em andamento' && (
        <div className="trilha" aria-label="Andamento do ciclo">
          <div className="barra"><span style={{ width: `${Math.round((r.progresso ?? 0) * 100)}%` }} /></div>
          <small>{r.estadio ? <Estadio e={r.estadio} curto /> : '–'}{r.dap != null ? ` · ${r.dap} dias de plantio` : ''}{r.diasParaColheita != null ? ` · colheita ${r.diasParaColheita >= 0 ? `em ${r.diasParaColheita} dias` : `atrasada ${-r.diasParaColheita} dias`}` : ''}</small>
        </div>
      )}
      {e.agora && <p className={`agora-destaque ${e.nivel}`}><b>Ponto de atenção agora:</b> {e.agora}</p>}
      {e.pontos.length > 0 && (
        <ul className="pontos">
          {e.pontos.filter((p) => p.texto !== e.agora).map((p, i) => <li key={i} className={p.nivel}>{p.texto}</li>)}
        </ul>
      )}
    </section>
  )
}

function resumoOps(ops: Operacao[]): string {
  if (!ops.length) return 'nenhuma ainda'
  const n = new Map<string, number>()
  for (const o of ops) n.set(o.tipo, (n.get(o.tipo) ?? 0) + 1)
  const pl = (w: string) => (w.endsWith('ão') ? w.slice(0, -2) + 'ões' : w.endsWith('m') ? w.slice(0, -1) + 'ns' : w + 's')
  // Só a primeira palavra vai para o plural: "2 preparos de solo", "3 pulverizações".
  const plural = (t: string, q: number) => (q === 1 ? t : t.replace(/^\S+/, pl))
  return [...n].map(([t, q]) => `${q} ${plural(t.toLowerCase(), q)}`).join(' · ')
}

/** Estádio: estimado (cultivar + dias de plantio) e confirmado pelo campo aparecem diferentes. */
export function Estadio({ e, curto }: { e: ReturnType<typeof estadioDaSafra>; curto?: boolean }) {
  const pessoas = useLive(() => db.pessoas.toArray()) ?? []
  const quem = (id?: string) => pessoas.find((p) => p.id === id)?.nome.split(' ')[0]
  if (!e.vale) return <span className="mudo">–</span>
  if (e.valeConfirmado && e.confirmado)
    return <span className="estadio confirmado" title="Confirmado no campo">{e.confirmado.estadio}{!curto && <small> confirmado {e.confirmado.dias === 0 ? 'hoje' : `há ${e.confirmado.dias} dia(s)`}{'autor' in e.confirmado && e.confirmado.autor ? ` por ${quem(e.confirmado.autor as string) ?? 'alguém da equipe'}` : ''}</small>}</span>
  return <span className="estadio estimado" title="Estimado pela cultivar e dias de plantio">{e.vale} <em>estimado</em>{!curto && e.confirmado && <small> último confirmado: {e.confirmado.estadio}, há {e.confirmado.dias} dias</small>}</span>
}

/** Quem está no campo confirma o estádio com um toque (qualquer pessoa da equipe, sem sinal também). */
function ConfirmarEstadio({ talhaoId, cicloId, cultura }: { talhaoId: string; cicloId: string; cultura: string }) {
  const { eu } = useSessao()
  const [aberto, setAberto] = useState(false)
  const opcoes = (cultura === 'Cana-de-açúcar' ? ESTADIOS_CANA : ESTADIOS_GRAOS).filter((x) => x !== 'Pré-plantio')
  if (!aberto) return <button className="mini confirmar-estadio" onClick={() => setAberto(true)}>Confirmar estádio</button>
  return (
    <div className="escolha-estadio" role="group" aria-label="Estádio visto no campo">
      {opcoes.map((x) => (
        <button key={x} className="mini" onClick={() => {
          void salvar('estadios', [{ id: uuid(), data_hora: new Date().toISOString(), autor_id: eu.id, talhao_id: talhaoId, ciclo_id: cicloId, estadio: x }])
          setAberto(false)
        }}>{x}</button>
      ))}
      <button className="mini" onClick={() => setAberto(false)}>Cancelar</button>
    </div>
  )
}

const ROT_SIT = { aberto: 'Aberto', 'em-tratamento': 'Em tratamento', perguntar: 'Resolveu?', resolvido: 'Resolvido' } as const

/** Problemas da safra no talhão: abertos, em tratamento (detectado pela aplicação) e os que esperam o "resolveu?". */
function Problemas({ ps }: { ps: Problema[] }) {
  const agora = () => new Date().toISOString()
  const resolveu = (id: string) => void alterar('campo', [id], { status: 'Resolvida', resolvido_em: agora() })
  const naoResolveu = (id: string) => void alterar('campo', [id], { reaberto_em: agora() })
  return (
    <section className="cartao">
      <h2>Problemas</h2>
      <ul className="lista problemas">
        {ps.map((p) => (
          <li key={p.c.id} className={`grav-${gravidade(p.c).toLowerCase()} sit-${p.situacao}`}>
            <div className="cab">
              <b>{nomeProblema(p.c)}</b>
              <span className={`selo ${p.situacao === 'aberto' ? (gravidade(p.c) === 'Alta' ? 'critico' : 'atencao') : p.situacao === 'perguntar' ? 'atencao' : 'bom'}`}>{ROT_SIT[p.situacao]}</span>
            </div>
            <small>{p.c.tipo} · {gravidade(p.c).toLowerCase()} · {fmtDataHora(p.c.data_hora)}{p.c.quem_viu ? ` · visto por: ${p.c.quem_viu.toLowerCase()}` : ''}{p.c.descricao ? ` · ${p.c.descricao}` : ''}</small>
            {p.tratamento && <small className="tratado">Tratado com {p.produto} em {fmtData(p.tratamento.data_hora)}{p.situacao === 'em-tratamento' ? ` (pergunta "resolveu?" em ${Math.max(0, 14 - (p.diasTratado ?? 0))} dias)` : ''}.</small>}
            {p.c.foto_path && <Foto path={p.c.foto_path} />}
            <div className="acoes">
              {p.situacao === 'perguntar' ? <>
                <button className="mini" onClick={() => resolveu(p.c.id)}>Sim, resolveu</button>
                <button className="mini" onClick={() => naoResolveu(p.c.id)}>Não resolveu</button>
              </> : <button className="mini" onClick={() => resolveu(p.c.id)}>Resolvido</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Foto do problema: do celular enquanto não subiu; do servidor depois. */
function Foto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true, local: string | null = null
    void (async () => {
      const f = await db.fotos.get(path)
      if (f) { local = URL.createObjectURL(f.blob); if (vivo) setUrl(local); return }
      if (!navigator.onLine) return
      const { data } = await supabase.storage.from('fotos').createSignedUrl(path, 3600)
      if (vivo && data?.signedUrl) setUrl(data.signedUrl)
    })()
    return () => { vivo = false; if (local) URL.revokeObjectURL(local) }
  }, [path])
  if (!url) return <small className="mudo">Foto (aparece com sinal)</small>
  return <a href={url} target="_blank" rel="noreferrer" className="foto-mini"><img src={url} alt="Foto do problema" /></a>
}
