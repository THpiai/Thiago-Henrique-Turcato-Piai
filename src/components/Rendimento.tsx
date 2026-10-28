import { useMemo } from 'react'
import type { Dados } from '../lib/painel'
import { atividade, faixaDaSafra, historicoSafras, linhasDaSafra, resumirRendimento, safraAnterior, type KpiCultura, type PontoHistorico } from '../lib/rendimento'
import { faixaDoPeriodo, usePeriodo } from '../lib/periodo'
import { COR_CULTURA } from '../lib/opcoes'
import { fmtData, fmtN } from '../lib/formato'
import { Aviso } from './ui'

const R$ = (n: number | null | undefined) => (n == null ? '–' : `R$ ${fmtN(n, 0)}`)
const ano = (s: string) => s.replace(/^\D+/, '')

/** Painel de rendimento da safra estilo BI: cartões de KPI, produtividade e custo por talhão, comparativo de safras e operações. */
export function Rendimento({ d, safra, talhoes, abrirTalhao, lancarHistorico }: {
  d: Dados; safra: string; talhoes: string[] | null; abrirTalhao: (id: string) => void; lancarHistorico?: () => void
}) {
  const [periodo] = usePeriodo()
  const faixa = faixaDoPeriodo(periodo)
  const linhas = useMemo(() => linhasDaSafra(d, safra, talhoes, faixa), [d, safra, talhoes, faixa?.de, faixa?.ate]) // eslint-disable-line react-hooks/exhaustive-deps
  const k = useMemo(() => resumirRendimento(linhas), [linhas])
  const hist = useMemo(() => historicoSafras(d, safra, talhoes), [d, safra, talhoes])
  // Comparar com a safra anterior só quando dá para comparar: esta já colhida e sem recorte de datas.
  const ant = !faixa && linhas.length > 0 && linhas.every((l) => l.ciclo.status === 'Colhido') ? safraAnterior(hist, safra) : undefined
  const datas = faixa ?? faixaDaSafra(linhas.map((l) => l.ciclo))
  const at = useMemo(() => atividade(linhas.flatMap((l) => l.operacoes), d), [linhas, d])

  if (!linhas.length) return <Aviso>Nenhum talhão escolhido no filtro está nesta safra.</Aviso>
  const colhidaPct = k.area > 0 ? k.areaColhida / k.area : 0

  return (
    <div className="rendimento">
      <p className="mudo resumo-safra">
        {linhas.length} talhões · {datas ? `${fmtData(datas.de)}/${datas.de.slice(2, 4)} a ${fmtData(datas.ate)}/${datas.ate.slice(2, 4)}` : 'sem datas de plantio'}
        {faixa ? ' · só o que aconteceu no período' : ''}
      </p>

      <section className="kpis kpis-rend">
        <div><b>{fmtN(k.area, 1)} <small>ha</small></b><span>área plantada</span></div>
        <div>
          <b>{fmtN(k.areaColhida, 1)} <small>ha</small></b>
          <span>colhida{faixa ? ' no período' : ''} · {Math.round(colhidaPct * 100)}%</span>
          <i className="medidor" aria-hidden><i style={{ width: `${Math.min(100, colhidaPct * 100)}%` }} /></i>
        </div>
        {k.culturas.map((c) => <CartaoProdutividade key={c.cultura} c={c} ant={ant} unica={k.culturas.length === 1} />)}
        <div>
          <b>{R$(k.custoHa)}<small>/ha</small></b>
          <span>insumos{k.custoEstimado ? ' (parte estimada)' : k.custoInformado ? ' (informado na safra)' : ''}</span>
          <Variacao atual={k.custoHa} antes={ant?.custoHa ?? null} rotulo={ant && ano(ant.safra)} subirEhBom={false} />
        </div>
        <div><b>{k.chuva != null ? `${fmtN(k.chuva, 0)} mm` : '–'}</b><span>chuva média{faixa ? ' no período' : ' do plantio até agora'}</span></div>
      </section>

      {k.culturas.map((c) => (
        <section key={c.cultura} className="cartao grafico">
          <h2>Produtividade por talhão{k.culturas.length > 1 ? ` · ${c.cultura}` : ''} <span className="mudo">({c.unidade}/ha)</span></h2>
          {c.linhas.some((l) => l.produtividade != null) ? (
            <Barras cor={COR_CULTURA[c.cultura]} casas={1} abrir={abrirTalhao}
              itens={c.linhas.map((l) => ({ id: l.talhao.id, rotulo: l.talhao.nome, valor: l.produtividade, sub: l.producao != null ? `${fmtN(l.producao, 0)} ${c.unidade} em ${fmtN(l.areaColhida, 1)} ha` : l.ciclo.status === 'Colhido' ? 'sem produção lançada' : 'ainda não colhido' }))}
              refs={[
                c.produtividade != null && { valor: c.produtividade, rotulo: `Média da fazenda ${fmtN(c.produtividade, 1)}`, tipo: 'media' as const },
                c.regional && { valor: c.regional.valor, rotulo: `Média regional ${fmtN(c.regional.valor, 1)}`, tipo: 'regional' as const, dica: c.regional.fonte },
                c.meta != null && { valor: c.meta, rotulo: `Meta ${fmtN(c.meta, 1)}`, tipo: 'meta' as const },
              ]} />
          ) : <p className="mudo">Ainda sem colheita {faixa ? 'no período' : 'nesta safra'}. As barras aparecem conforme a Colheita é registrada (com a produção) em Registrar › Operação.</p>}
        </section>
      ))}

      <section className="cartao grafico">
        <h2>Custo de insumos por talhão <span className="mudo">(R$/ha)</span></h2>
        {linhas.some((l) => l.custoHa != null) ? (
          <Barras cor="var(--ouro)" casas={0} prefixo="R$ " abrir={abrirTalhao}
            itens={linhas.map((l) => ({ id: l.talhao.id, rotulo: l.talhao.nome, valor: l.custoHa, sub: l.custoInformado ? 'informado na safra' : l.custoEstimado ? 'parte pelo padrão mercado' : undefined }))}
            refs={[k.custoHa != null && { valor: k.custoHa, rotulo: `Média ${R$(k.custoHa)}`, tipo: 'media' as const }]} />
        ) : <p className="mudo">Sem insumos com preço {faixa ? 'no período' : 'nesta safra'}. O custo sai das aplicações registradas e do preço de entrada no estoque.</p>}
      </section>

      <Comparativo hist={hist} safra={safra} culturas={k.culturas} lancarHistorico={lancarHistorico} />

      <section className="cartao grafico">
        <h2>Operações {faixa ? 'no período' : 'da safra'}</h2>
        {at.operacoes ? (
          <>
            <p className="mudo legenda-grafico">{at.operacoes} operações · {fmtN(at.ha, 0)} ha trabalhados · {at.aplicacoes} pulverizações · {R$(at.custo)} em insumos{at.custoEstimado ? ' (parte estimada)' : ''}</p>
            <Barras cor="var(--verde)" casas={0} sufixo=" ha" itens={at.porTipo.map((x) => ({ id: x.tipo, rotulo: x.tipo, valor: x.ha, sub: `${x.n} ${x.n > 1 ? 'vezes' : 'vez'}` }))} refs={[]} />
          </>
        ) : <p className="mudo">Nenhuma operação {faixa ? 'no período' : 'nesta safra'}.</p>}
      </section>
    </div>
  )
}

function CartaoProdutividade({ c, ant, unica }: { c: KpiCultura; ant?: PontoHistorico; unica: boolean }) {
  const antes = ant?.culturas.get(c.cultura)?.produtividade ?? null
  const vsReg = c.produtividade != null && c.regional ? c.produtividade / c.regional.valor : null
  return (
    <div className="kpi-destaque" style={{ borderTopColor: COR_CULTURA[c.cultura] }}>
      <b>{fmtN(c.produtividade, 1)} <small>{c.unidade}/ha</small></b>
      <span>{unica ? 'produtividade média' : c.cultura}{c.producao != null ? ` · ${fmtN(c.producao, 0)} ${c.unidade}` : ''}</span>
      <Variacao atual={c.produtividade} antes={antes} rotulo={ant && ano(ant.safra)} subirEhBom />
      {vsReg != null && <small className={vsReg >= 1 ? 'bom' : 'ruim'}>{Math.round(vsReg * 100)}% da média regional</small>}
    </div>
  )
}

function Variacao({ atual, antes, rotulo, subirEhBom }: { atual: number | null; antes: number | null; rotulo?: string; subirEhBom: boolean }) {
  if (atual == null || antes == null || antes === 0 || !rotulo) return null
  const v = atual / antes - 1
  const pct = Math.round(v * 100)
  const bom = pct === 0 ? null : (pct > 0) === subirEhBom
  return <small className={bom == null ? '' : bom ? 'bom' : 'ruim'}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct)}% vs {rotulo}</small>
}

type Ref = { valor: number; rotulo: string; tipo: 'media' | 'regional' | 'meta'; dica?: string }

/** Barras deitadas, da maior para a menor, com o valor na ponta e linhas de referência (média, regional, meta). */
function Barras({ itens, refs, cor, casas, prefixo = '', sufixo = '', abrir }: {
  itens: { id: string; rotulo: string; valor: number | null; sub?: string }[]
  refs: (Ref | false | null | undefined)[]; cor: string; casas: number; prefixo?: string; sufixo?: string; abrir?: (id: string) => void
}) {
  const rs = refs.filter((r): r is Ref => !!r)
  const ordem = [...itens].sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1))
  const max = Math.max(1, ...ordem.map((x) => x.valor ?? 0), ...rs.map((r) => r.valor)) * 1.04
  const pos = (v: number) => `${(v / max) * 100}%`
  return (
    <>
      {rs.length > 0 && (
        <ul className="legenda-ref">
          {rs.map((r) => <li key={r.tipo} className={r.tipo} title={r.dica}><i aria-hidden />{r.rotulo}</li>)}
        </ul>
      )}
      <ol className="barras">
        {ordem.map((x) => {
          const conteudo = (
            <>
              <span className="rot"><b>{x.rotulo}</b>{x.sub && <small>{x.sub}</small>}</span>
              <span className="trilho">
                {x.valor != null && <i className="barra" style={{ width: pos(x.valor), background: cor }} />}
                {rs.map((r) => <i key={r.tipo} className={`ref ${r.tipo}`} style={{ left: pos(r.valor) }} aria-hidden />)}
              </span>
              <span className="val">{x.valor != null ? `${prefixo}${fmtN(x.valor, casas)}${sufixo}` : '–'}</span>
            </>
          )
          return (
            <li key={x.id} title={`${x.rotulo}: ${x.valor != null ? `${prefixo}${fmtN(x.valor, casas)}${sufixo}` : 'sem dado'}`}>
              {abrir ? <button className="linha-barra" onClick={() => abrir(x.id)}>{conteudo}</button> : <div className="linha-barra">{conteudo}</div>}
            </li>
          )
        })}
      </ol>
      {rs.filter((r) => r.dica).map((r) => <small key={r.tipo} className="fonte-ref">Média regional: {r.dica}</small>)}
    </>
  )
}

/** Produtividade média de cada safra da mesma família (esta e as passadas), com a média regional. */
function Comparativo({ hist, safra, culturas, lancarHistorico }: { hist: PontoHistorico[]; safra: string; culturas: KpiCultura[]; lancarHistorico?: () => void }) {
  const comDados = hist.filter((h) => [...h.culturas.values()].some((c) => c.produtividade != null))
  return (
    <section className="cartao grafico">
      <h2>Comparativo de safras</h2>
      {comDados.length < 2 ? (
        <p className="mudo">
          Para comparar, é preciso ao menos duas safras com produção.{' '}
          {lancarHistorico && <button className="link" onClick={lancarHistorico}>Lançar safras passadas</button>}
        </p>
      ) : culturas.filter((c) => c.cultura !== 'Pousio').map((c) => {
        // Safra sem colheita fica de fora, menos a escolhida (mostra "–" até colher).
        const pts = hist.map((h) => ({ safra: h.safra, v: h.culturas.get(c.cultura)?.produtividade ?? null })).filter((p) => p.v != null || p.safra === safra)
        const reg = c.regional?.valor
        const max = Math.max(1, ...pts.map((p) => p.v ?? 0), reg ?? 0) * 1.12
        return (
          <div key={c.cultura} className="comparativo">
            {culturas.length > 1 && <h3>{c.cultura} <span className="mudo">({c.unidade}/ha)</span></h3>}
            {reg && <ul className="legenda-ref"><li className="regional"><i aria-hidden />Média regional {fmtN(reg, 1)} {c.unidade}/ha</li></ul>}
            <div className="colunas" role="img" aria-label={`Produtividade por safra: ${pts.map((p) => `${p.safra} ${p.v != null ? fmtN(p.v, 1) : 'sem dado'}`).join(', ')}`}>
              {reg && <i className="ref-h regional" style={{ bottom: `${(reg / max) * 100}%` }} aria-hidden />}
              {pts.map((p) => (
                <div key={p.safra} className={p.safra === safra ? 'coluna atual' : 'coluna'} title={`${p.safra}: ${p.v != null ? fmtN(p.v, 1) : 'sem dado'}`}>
                  <span className="val">{p.v != null ? fmtN(p.v, 1) : '–'}</span>
                  <i style={{ height: `${((p.v ?? 0) / max) * 100}%`, background: COR_CULTURA[c.cultura] }} />
                </div>
              ))}
            </div>
            <div className="colunas-rotulos">{pts.map((p) => <span key={p.safra} className={p.safra === safra ? 'atual' : ''}>{ano(p.safra)}</span>)}</div>
          </div>
        )
      })}
      {comDados.length >= 2 && lancarHistorico && <p className="mudo"><button className="link" onClick={lancarHistorico}>Lançar mais safras passadas</button></p>}
    </section>
  )
}
