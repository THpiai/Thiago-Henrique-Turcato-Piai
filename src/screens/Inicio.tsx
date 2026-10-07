import { useMemo } from 'react'
import { useDados, useSessao } from '../lib/hooks'
import { abaixoDoMinimo, resumoTalhao, type Resumo } from '../lib/painel'
import { COR_CULTURA } from '../lib/opcoes'
import { fmtData, fmtN } from '../lib/formato'
import { Aviso } from '../components/ui'

export function Inicio({ abrirTalhao, ir }: { abrirTalhao: (id: string) => void; ir: (tela: string) => void }) {
  const d = useDados()
  const { eu, gestor } = useSessao()
  const resumos = useMemo(() => (d ? d.talhoes.map((t) => resumoTalhao(t, d)) : []), [d])
  if (!d) return <p className="vazio">Carregando…</p>

  const areaTotal = d.talhoes.reduce((s, t) => s + Number(t.area_ha), 0)
  const emCampo = resumos.filter((r) => r.ciclo?.status === 'Em andamento')
  const indicadas = resumos.flatMap((r) => r.alertas.filter((a) => a.status === 'Aplicação indicada').map((a) => ({ a, r })))
  const baixos = d.saldos.filter(abaixoDoMinimo)
  const chuva7 = resumos.length ? Math.max(...resumos.map((r) => r.chuva7)) : 0

  return (
    <div className="tela">
      <h1 className="saudacao">Olá, {eu.nome.split(' ')[0]}</h1>

      {d.talhoes.length === 0 && (
        <Aviso>
          {gestor ? <>Comece desenhando os talhões no <button className="link" onClick={() => ir('mapa')}>Mapa</button>. Depois cadastre as safras e os insumos.</>
            : 'Os talhões ainda não foram cadastrados. Assim que o Thiago desenhar, eles aparecem aqui.'}
        </Aviso>
      )}

      <section className="kpis">
        <div><b>{fmtN(areaTotal, 1)}</b><span>ha em {d.talhoes.length} talhões</span></div>
        <div><b>{emCampo.length}</b><span>com lavoura em campo</span></div>
        <div className={indicadas.length ? 'alerta' : ''}><b>{indicadas.length}</b><span>aplicações indicadas</span></div>
        <div><b>{fmtN(chuva7, 0)} mm</b><span>chuva em 7 dias</span></div>
      </section>

      {(indicadas.length > 0 || baixos.length > 0) && (
        <section>
          <h2>Atenção</h2>
          <ul className="lista">
            {indicadas.map(({ a, r }) => (
              <li key={a.id} className="alerta" onClick={() => abrirTalhao(r.talhao.id)}>
                <b>{r.talhao.nome}</b> · {a.alvo || a.tipo} acima do nível de controle
                <small>{fmtN(a.nivel_encontrado, 2)} {a.unidade_nivel ?? ''} (controle {fmtN(a.nivel_de_controle, 2)}) · {fmtData(a.data_hora)}</small>
              </li>
            ))}
            {baixos.map((s) => (
              <li key={s.insumo_id} onClick={() => ir('estoque')}>
                <b>{s.nome}</b> abaixo do mínimo
                <small>Saldo {fmtN(Number(s.saldo), 1)} {s.unidade} · mínimo {fmtN(Number(s.estoque_minimo), 1)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Talhões</h2>
        <div className="grade-talhoes">
          {resumos.map((r) => <CartaoTalhao key={r.talhao.id} r={r} abrir={() => abrirTalhao(r.talhao.id)} />)}
        </div>
      </section>
    </div>
  )
}

function CartaoTalhao({ r, abrir }: { r: Resumo; abrir: () => void }) {
  const c = r.ciclo
  const cor = COR_CULTURA[c?.cultura ?? 'Pousio'] ?? 'var(--pousio)'
  return (
    <button className="talhao" onClick={abrir} style={{ ['--cor' as string]: cor }}>
      <div className="topo">
        <b>{r.talhao.nome}</b>
        <span className="area">{fmtN(Number(r.talhao.area_ha), 1)} ha</span>
      </div>
      <div className="cultura">
        {c ? <>{c.cultura}{c.cultivar ? ` · ${c.cultivar}` : ''} <small>{c.status}</small></> : <span className="mudo">Sem safra cadastrada</span>}
      </div>
      {r.progresso != null && (
        <div className="progresso" title="Andamento do ciclo da cultivar">
          <div style={{ width: `${r.progresso * 100}%` }} />
        </div>
      )}
      <div className="linhas">
        {r.dap != null && <span>{r.dap} DAP</span>}
        {c?.estadio_atual && <span>{c.estadio_atual}</span>}
        {r.diasParaColheita != null && <span>{r.diasParaColheita >= 0 ? `colheita em ${r.diasParaColheita} d` : `colheita prevista há ${-r.diasParaColheita} d`}</span>}
        {r.produtividade != null && <span><b>{fmtN(r.produtividade, 1)} {c?.unidade_producao}/ha</b>{r.vsMeta != null && ` (${fmtN(r.vsMeta * 100, 0)}% da meta)`}</span>}
      </div>
      <div className="rodape">
        <span>🌧 {fmtN(r.chuva7, 0)} mm/7d · {fmtN(r.chuva30, 0)} mm/30d</span>
        {r.custoHa != null && <span>R$ {fmtN(r.custoHa, 0)}/ha</span>}
        {r.alertas.length > 0 && <span className={r.alertas.some((a) => a.status === 'Aplicação indicada') ? 'tag vermelho' : 'tag'}>{r.alertas.length} ocorrência(s)</span>}
      </div>
      {r.ultimaOperacao && <small className="mudo">Última: {r.ultimaOperacao.tipo} em {fmtData(r.ultimaOperacao.data_hora)}</small>}
    </button>
  )
}
