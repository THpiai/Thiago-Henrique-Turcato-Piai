import { useMemo } from 'react'
import { useDados, useLive, useSessao } from '../lib/hooks'
import { db } from '../lib/db'
import { abaixoDoMinimo, chuvaPeriodo, climaNaHora, janelasAplicacao, resumoTalhao, type Dados, type Resumo } from '../lib/painel'
import { COR_CULTURA } from '../lib/opcoes'
import { fmtData, fmtDataHora, fmtN } from '../lib/formato'
import { Aviso } from '../components/ui'
import { Icone } from '../components/Icone'

export function Inicio({ abrirTalhao, ir }: { abrirTalhao: (id: string) => void; ir: (tela: string) => void }) {
  const d = useDados()
  const { eu, gestor } = useSessao()
  const resumos = useMemo(() => (d ? d.talhoes.map((t) => resumoTalhao(t, d)) : []), [d])
  if (!d) return <p className="vazio">Carregando…</p>

  const areaTotal = d.talhoes.reduce((s, t) => s + Number(t.area_ha), 0)
  const emCampo = resumos.filter((r) => r.ciclo?.status === 'Em andamento')
  const abertos = resumos.reduce((n, r) => n + r.problemas.filter((p) => p.situacao === 'aberto').length, 0)
  const criticos = resumos.filter((r) => r.estado.nivel === 'critico').length
  const baixos = d.saldos.filter(abaixoDoMinimo)
  // Talhões com ponto de atenção agora, do crítico ao de atenção.
  const pedem = resumos.filter((r) => (r.estado.nivel === 'critico' || r.estado.nivel === 'atencao') && r.estado.agora)
    .sort((a, b) => Number(b.estado.nivel === 'critico') - Number(a.estado.nivel === 'critico'))
  const chuva7 = resumos.length ? Math.max(...resumos.map((r) => r.chuva7)) : Math.max(0, ...d.sedes.map((s) => chuvaPeriodo(null, d.chuva, 7, s.id)))

  return (
    <div className="tela">
      <h1 className="saudacao">Olá, {eu.nome.split(' ')[0]}</h1>
      <p className="mudo data-hoje">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      {d.talhoes.length === 0 && (
        <Aviso>
          {gestor ? <>Comece desenhando os talhões no <button className="link" onClick={() => ir('mapa')}>Mapa</button>. Depois cadastre as safras e os insumos.</>
            : 'Os talhões ainda não foram cadastrados. Assim que o Thiago desenhar, eles aparecem aqui.'}
        </Aviso>
      )}

      <section className="kpis">
        <div><b>{fmtN(areaTotal, 1)}</b><span>ha em {d.talhoes.length} talhões</span></div>
        <div><b>{emCampo.length}</b><span>com lavoura em campo</span></div>
        <div className={criticos ? 'alerta' : ''}><b>{abertos}</b><span>problemas abertos{criticos ? ` · ${criticos} talhão(ões) crítico(s)` : ''}</span></div>
        <div><b>{fmtN(chuva7, 0)} mm</b><span>chuva em 7 dias</span></div>
      </section>

      <div className="layout-inicio">
        <div>
          <section>
            <h2>Talhões</h2>
            <div className="grade-talhoes">
              {resumos.map((r) => <CartaoTalhao key={r.talhao.id} r={r} abrir={() => abrirTalhao(r.talhao.id)} />)}
            </div>
          </section>
        </div>
        <aside>
          {(baixos.length > 0 || pedem.length > 0) && (
            <section>
              <h2>Atenção</h2>
              <ul className="lista">
                {pedem.map((r) => (
                  <li key={'e' + r.talhao.id} className={r.estado.nivel === 'critico' ? 'alerta' : ''} onClick={() => abrirTalhao(r.talhao.id)}>
                    <b>{r.talhao.nome}</b> · {r.estado.titulo.toLowerCase()}
                    <small>{r.estado.agora}</small>
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

          <ClimaSedes d={d} />
        </aside>
      </div>
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
        {r.ciclo && r.estado.nivel !== 'bom' && <span className={`selo ${r.estado.nivel}`} title={r.estado.pontos[0]?.texto}>{r.estado.titulo}</span>}
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
        {r.estado.estadio && c?.status === 'Em andamento' && <span className={r.estado.estadioEstimado ? 'estadio estimado' : 'estadio confirmado'}>{r.estado.estadio}{r.estado.estadioEstimado ? <em> estimado</em> : ''}</span>}
        {r.diasParaColheita != null && <span>{r.diasParaColheita >= 0 ? `colheita em ${r.diasParaColheita} d` : `colheita prevista há ${-r.diasParaColheita} d`}</span>}
        {r.produtividade != null && <span><b>{fmtN(r.produtividade, 1)} {c?.unidade_producao}/ha</b>{r.vsMeta != null && ` (${fmtN(r.vsMeta * 100, 0)}% da meta)`}</span>}
      </div>
      <div className="rodape">
        <span className="com-icone"><Icone n="chuva" t={16} />{fmtN(r.chuva7, 0)} mm em 7 d · {fmtN(r.chuva30, 0)} em 30 d</span>
        {r.custoHa != null && <span>R$ {fmtN(r.custoHa, 0)}/ha</span>}
        {r.problemas.length > 0 && <span className={r.cor === 'critico' ? 'tag vermelho' : 'tag'}>{r.problemas.length} problema(s)</span>}
      </div>
      {r.ciclo && r.estado.nivel !== 'bom' && r.estado.agora && <small className={`motivo ${r.estado.nivel}`}>{r.estado.agora}</small>}
      {r.ultimaOperacao && <small className="mudo">Última: {r.ultimaOperacao.tipo} em {fmtData(r.ultimaOperacao.data_hora)}</small>}
    </button>
  )
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaSemana = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')

/** Chuva estimada e janela de pulverização de cada sede (Open-Meteo, atualizado 2x por dia). */
function ClimaSedes({ d }: { d: Dados }) {
  const clima = useLive(() => db.clima.toArray()) ?? []
  if (!d.sedes.length) return null
  const agora = new Date()
  return (
    <section>
      <h2>Clima nas sedes</h2>
      <div className="grade-sedes">
        {d.sedes.map((s) => {
          const c = climaNaHora(clima, s.id, agora)
          const janelas = janelasAplicacao(clima, s.id, agora, 36)
          return (
            <div key={s.id} className="cartao sede">
              <div className="topo"><b>{s.nome}</b>{c && <span className="mudo">agora {fmtN(c.temperatura_c, 0)} °C · {fmtN(c.umidade_pct, 0)}% · vento {fmtN(c.vento_kmh, 0)} km/h</span>}</div>
              <div className="com-icone"><Icone n="chuva" t={16} />{fmtN(chuvaPeriodo(null, d.chuva, 7, s.id), 0)} mm em 7 dias · {fmtN(chuvaPeriodo(null, d.chuva, 30, s.id), 0)} mm em 30 dias</div>
              {clima.some((x) => x.sede_id === s.id) && (
                <small>
                  Janela para pulverizar (36 h): {janelas.length
                    ? janelas.slice(0, 3).map((j) => `${diaSemana(j.inicio)} ${hora(j.inicio)}–${hora(new Date(new Date(j.fim).getTime() + 3600e3).toISOString())}`).join(' · ')
                    : 'nenhuma dentro da faixa recomendada'}
                </small>
              )}
            </div>
          )
        })}
      </div>
      <small className="mudo">Estimativa Open-Meteo. Leitura de pluviômetro do talhão substitui a estimativa no painel.{clima[0] ? ` Atualizado até ${fmtDataHora(clima.reduce((m, x) => (x.hora > m ? x.hora : m), clima[0].hora))} (previsão).` : ''}</small>
    </section>
  )
}
