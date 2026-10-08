import { useEffect, useMemo, useState } from 'react'
import { useDados, useLive, useSessao } from '../lib/hooks'
import { resumoTalhao, type Resumo } from '../lib/painel'
import type { Operacao } from '../lib/tipos'
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

type Evento = { id: string; quando: string; titulo: string; detalhe?: string; tipo: 'op' | 'campo' | 'chuva'; tabela: TabelaSync; autor?: string | null; pendente?: boolean }

const NOME: Record<string, string> = { op: 'Operação', campo: 'Problema', chuva: 'Leitura de chuva' }

export function TalhaoDetalhe({ id, voltar, editarCiclo }: { id: string; voltar: () => void; editarCiclo: (talhaoId: string, cicloId?: string) => void }) {
  const d = useDados()
  const { gestor, eu } = useSessao()
  const insumos = useLive(() => db.insumos.toArray()) ?? []
  const t = d?.talhoes.find((x) => x.id === id)
  const r = useMemo(() => (d && t ? resumoTalhao(t, d) : null), [d, t])
  if (!d || !t || !r) return <p className="vazio">Carregando…</p>
  const nomeInsumo = (i: string) => insumos.find((x) => x.id === i)?.nome ?? 'insumo'

  const eventos: Evento[] = [
    ...d.operacoes.filter((o) => o.talhao_id === id).map((o) => ({
      id: o.id, quando: o.data_hora, tipo: 'op' as const, tabela: 'operacoes' as const, autor: o.autor_id, pendente: o._pendente === 1,
      titulo: o.tipo + (o.alvo ? ` · ${o.alvo}` : ''),
      detalhe: d.produtos.filter((p) => p.operacao_id === o.id).map((p) => `${nomeInsumo(p.insumo_id)} ${fmtN(p.dose_ha, 2)} ${p.unidade}/ha`).join(' + ') || o.observacao || undefined,
    })),
    ...d.campo.filter((c) => c.talhao_id === id).map((c) => ({
      id: c.id, quando: c.data_hora, tipo: 'campo' as const, tabela: 'campo' as const, autor: c.autor_id, pendente: c._pendente === 1,
      titulo: `${c.tipo}${c.alvo ? ` · ${c.alvo}` : ''} — ${gravidade(c).toLowerCase()}${c.status === 'Resolvida' ? ', resolvido' : ''}`,
      detalhe: [c.quem_viu && c.quem_viu !== 'Equipe' ? `visto pelo ${c.quem_viu.toLowerCase()}` : '', c.nivel_encontrado != null ? `${fmtN(c.nivel_encontrado, 2)} ${c.unidade_nivel ?? ''}` : '', c.descricao].filter(Boolean).join(' · ') || undefined,
    })),
    ...d.chuva.filter((c) => c.talhao_id === id).map((c) => ({
      id: c.id, quando: c.data, tipo: 'chuva' as const, tabela: 'chuva' as const, autor: c.autor_id, pendente: c._pendente === 1, titulo: `Chuva ${fmtN(Number(c.milimetros), 1)} mm`,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 60)

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

      {ciclos.length > 1 && (
        <section className="cartao">
          <h2>Histórico de safras</h2>
          <table className="tabela">
            <thead><tr><th>Safra</th><th>Cultura</th><th>Produção/ha</th><th>Meta</th></tr></thead>
            <tbody>
              {ciclos.map((c) => (
                <tr key={c.id} onClick={() => gestor && editarCiclo(id, c.id)}>
                  <td>{c.safra}</td><td>{c.cultura}</td>
                  <td className="num">{c.producao != null ? `${fmtN(c.producao / Number(t.area_ha), 1)} ${c.unidade_producao}` : '–'}</td>
                  <td className="num">{fmtN(c.meta_por_ha, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Linha do tempo</h2>
        {eventos.length === 0 ? <p className="mudo">Nada registrado ainda.</p> : (
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
