import { useMemo } from 'react'
import { useDados, useLive, useSessao } from '../lib/hooks'
import { resumoTalhao } from '../lib/painel'
import { db } from '../lib/db'
import { fmtData, fmtDataHora, fmtN } from '../lib/formato'
import { alterar, apagar, restaurar } from '../lib/sync'
import type { TabelaSync } from '../lib/db'
import { BotaoApagar, mostrarDesfazer } from '../components/Apagar'

type Evento = { id: string; quando: string; titulo: string; detalhe?: string; tipo: 'op' | 'campo' | 'chuva'; tabela: TabelaSync; autor?: string | null; pendente?: boolean }

const NOME: Record<string, string> = { op: 'Operação', campo: 'Monitoramento', chuva: 'Leitura de chuva' }

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
      titulo: `${c.tipo}${c.alvo ? ` · ${c.alvo}` : ''} — ${c.status}`,
      detalhe: [c.nivel_encontrado != null ? `${fmtN(c.nivel_encontrado, 2)} ${c.unidade_nivel ?? ''} (controle ${fmtN(c.nivel_de_controle, 2)})` : '', c.descricao].filter(Boolean).join(' · ') || undefined,
    })),
    ...d.chuva.filter((c) => c.talhao_id === id).map((c) => ({
      id: c.id, quando: c.data, tipo: 'chuva' as const, tabela: 'chuva' as const, autor: c.autor_id, pendente: c._pendente === 1, titulo: `Chuva ${fmtN(Number(c.milimetros), 1)} mm`,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 60)

  const ciclos = d.ciclos.filter((c) => c.talhao_id === id).sort((a, b) => (b.data_plantio ?? b.safra).localeCompare(a.data_plantio ?? a.safra))

  const resolver = (cid: string) => alterar('campo', [cid], { status: 'Resolvida', resolvido_em: new Date().toISOString() })
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

      <section className="cartao">
        <h2>Safra atual</h2>
        {r.ciclo ? (
          <dl className="ficha">
            <dt>Safra</dt><dd>{r.ciclo.safra} · {r.ciclo.cultura}</dd>
            {r.ciclo.cultivar && <><dt>Cultivar</dt><dd>{r.ciclo.cultivar}{r.ciclo.ciclo_cultivar_dias ? ` (${r.ciclo.ciclo_cultivar_dias} dias)` : ''}</dd></>}
            <dt>Plantio</dt><dd>{fmtData(r.ciclo.data_plantio)}{r.dap != null ? ` · ${r.dap} DAP` : ''}</dd>
            {r.ciclo.populacao_plantas_ha && <><dt>População</dt><dd>{fmtN(r.ciclo.populacao_plantas_ha)} plantas/ha</dd></>}
            <dt>Estádio</dt><dd>{r.ciclo.estadio_atual ?? '–'}{r.ciclo.data_estadio ? ` (${fmtData(r.ciclo.data_estadio)})` : ''}</dd>
            <dt>Colheita</dt><dd>{r.ciclo.data_colheita ? `colhido em ${fmtData(r.ciclo.data_colheita)}` : r.diasParaColheita != null ? `prevista em ${r.diasParaColheita} dias` : '–'}</dd>
            {r.ciclo.producao != null && <><dt>Produção</dt><dd>{fmtN(r.ciclo.producao, 1)} {r.ciclo.unidade_producao} · <b>{fmtN(r.produtividade, 1)} {r.ciclo.unidade_producao}/ha</b>{r.ciclo.meta_por_ha ? ` (meta ${fmtN(r.ciclo.meta_por_ha, 1)})` : ''}</dd></>}
            {r.ciclo.cultura === 'Cana-de-açúcar' && r.ciclo.atr_kg_t != null && <><dt>ATR</dt><dd>{fmtN(r.ciclo.atr_kg_t, 1)} kg/t{r.ciclo.corte_cana ? ` · ${r.ciclo.corte_cana}º corte` : ''}</dd></>}
            <dt>Insumos</dt><dd>{r.custoHa != null ? `R$ ${fmtN(r.custoHa, 0)}/ha` : 'sem preço de entrada no estoque'}</dd>
            <dt>Chuva</dt><dd>{fmtN(r.chuva7, 0)} mm em 7 dias · {fmtN(r.chuva30, 0)} mm em 30 dias</dd>
          </dl>
        ) : <p className="mudo">Nenhuma safra cadastrada para este talhão.</p>}
        {gestor && (
          <div className="acoes">
            {r.ciclo && <button className="secundario" onClick={() => editarCiclo(id, r.ciclo!.id)}>Atualizar estádio / colheita</button>}
            <button className="secundario" onClick={() => editarCiclo(id)}>Nova safra</button>
          </div>
        )}
      </section>

      {r.alertas.length > 0 && (
        <section className="cartao">
          <h2>Ocorrências abertas</h2>
          <ul className="lista">
            {r.alertas.map((a) => (
              <li key={a.id} className={a.status === 'Aplicação indicada' ? 'alerta' : ''}>
                <b>{a.tipo}{a.alvo ? ` · ${a.alvo}` : ''}</b> — {a.status}{a.urgencia ? ` · urgência ${a.urgencia.toLowerCase()}` : ''}
                <small>{fmtDataHora(a.data_hora)}{a.descricao ? ` · ${a.descricao}` : ''}</small>
                <button className="mini" onClick={() => void resolver(a.id)}>Resolvida</button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
