import { useState } from 'react'
import type { Operacao, Talhao } from '../lib/tipos'
import { lotesAbertos, type LoteAberto } from '../lib/operacoes'
import { TIPOS_COLHEITA } from '../lib/safra'
import { useGravar, useSessao } from '../lib/hooks'
import { agoraLocal, fmtData, fmtN, num } from '../lib/formato'
import { fecharOperacao } from '../lib/sync'

/** Operações que começaram e ainda não terminaram, com o botão para marcar o término. */
export function EmAndamento({ ops, talhoes, titulo = 'Em andamento', abrirTalhao }: {
  ops: Operacao[]; talhoes: Talhao[]; titulo?: string; abrirTalhao?: (id: string) => void
}) {
  const lotes = lotesAbertos(ops)
  if (!lotes.length) return null
  return (
    <section>
      <h2>{titulo}</h2>
      <ul className="lista em-andamento">
        {lotes.map((l) => <Lote key={l.chave} l={l} talhoes={talhoes} abrirTalhao={abrirTalhao} />)}
      </ul>
    </section>
  )
}

function Lote({ l, talhoes, abrirTalhao }: { l: LoteAberto; talhoes: Talhao[]; abrirTalhao?: (id: string) => void }) {
  const { eu, gestor } = useSessao()
  const [aberto, setAberto] = useState(false)
  const nome = (id: string) => talhoes.find((t) => t.id === id)?.nome ?? 'talhão'
  const pode = gestor || l.ops.every((o) => o.autor_id === eu.id)
  return (
    <li className={l.lembrar ? 'alerta' : ''}>
      <div className="cab-andamento">
        <div>
          <b>{l.tipo}</b> · {l.ops.length === 1 && abrirTalhao
            ? <button className="link" onClick={() => abrirTalhao(l.ops[0].talhao_id)}>{nome(l.ops[0].talhao_id)}</button>
            : l.ops.map((o) => nome(o.talhao_id)).join(', ')}
          <small>Começou em {fmtData(l.inicio)} · {l.dias === 0 ? 'hoje' : `há ${l.dias} dia(s)`}{l.lembrar ? '. Já terminou?' : ''}</small>
        </div>
        {pode && !aberto && <button className="mini" onClick={() => setAberto(true)}>Terminou</button>}
      </div>
      {aberto && <Fechar l={l} nome={nome} pronto={() => setAberto(false)} />}
    </li>
  )
}

/** Fechamento: dia do término, área feita em cada talhão (e produção, na colheita). */
function Fechar({ l, nome, pronto }: { l: LoteAberto; nome: (id: string) => string; pronto: () => void }) {
  const [fim, setFim] = useState(agoraLocal())
  const [areas, setAreas] = useState<Record<string, string>>({})
  const [prods, setProds] = useState<Record<string, string>>({})
  const colheita = TIPOS_COLHEITA.includes(l.tipo)
  const antes = new Date(fim).getTime() < new Date(l.inicio).getTime()
  const { salvando, gravar } = useGravar()
  async function confirmar() {
    if (antes) return
    await gravar(() => fechar())
  }
  async function fechar() {
    const data_fim = new Date(fim).toISOString()
    for (const o of l.ops) {
      const area = num(areas[o.id]) ?? o.area_ha ?? null
      const producao = colheita ? num(prods[o.id]) : null
      await fecharOperacao(o.id, {
        data_fim, area_ha: area,
        ...(colheita && producao != null ? { producao, unidade_producao: o.tipo === 'Corte de cana' ? 't' : o.unidade_producao ?? 'sc' } : {}),
      })
    }
    pronto()
  }
  return (
    <div className="fechar-op">
      <label className="campo"><span className="rotulo">Terminou em</span>
        <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
        {antes && <small className="dica">O término ficou antes do início.</small>}
      </label>
      {l.ops.map((o) => (
        <div className="linha-talhao-op" key={o.id}>
          <div className="nome"><b>{nome(o.talhao_id)}</b><small>planejado {fmtN(o.area_ha, 2)} ha</small></div>
          <label className="campo-mini"><span>ha feitos</span>
            <input inputMode="decimal" aria-label={`Área feita em ${nome(o.talhao_id)}`} value={areas[o.id] ?? String(o.area_ha ?? '').replace('.', ',')}
              onChange={(e) => setAreas({ ...areas, [o.id]: e.target.value })} />
          </label>
          {colheita && (
            <label className="campo-mini"><span>produção ({o.tipo === 'Corte de cana' ? 't' : 'sc'})</span>
              <input inputMode="decimal" aria-label={`Produção em ${nome(o.talhao_id)}`} value={prods[o.id] ?? ''} onChange={(e) => setProds({ ...prods, [o.id]: e.target.value })} />
            </label>
          )}
        </div>
      ))}
      <small className="dica">Se a área mudou, os insumos e o custo são corrigidos.</small>
      <div className="acoes">
        <button className="primario" onClick={() => void confirmar()} disabled={antes || salvando}>{salvando ? 'Salvando…' : 'Confirmar término'}</button>
        <button className="secundario" onClick={pronto}>Cancelar</button>
      </div>
    </div>
  )
}
