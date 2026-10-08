import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao } from '../lib/hooks'
import { MOVIMENTOS } from '../lib/opcoes'
import { fmtN, hojeISO, num, uuid } from '../lib/formato'
import { apagar, restaurar, salvar } from '../lib/sync'
import { BotaoApagar, mostrarDesfazer } from '../components/Apagar'
import { fmtData } from '../lib/formato'
import { Aviso, Escolha, Rotulo } from '../components/ui'
import { precoMercado, referenciaInsumo } from '../lib/mercado'

/** Saldo do servidor mais o que ainda está só no celular. */
function useSaldos() {
  return useLive(async () => {
    const [insumos, saldos, movs, prods] = await Promise.all([
      db.insumos.orderBy('nome').toArray(), db.saldos.toArray(),
      db.estoque_mov.filter((m) => m._pendente === 1).toArray(), db.operacao_produtos.filter((p) => p._pendente === 1).toArray(),
    ])
    // Pendente no celular entra no saldo até o servidor confirmar; o que foi para a lixeira não conta.
    const opsApagadas = new Set((await db.operacoes.filter((o) => !!o.excluido_em).toArray()).map((o) => o.id))
    return insumos.filter((i) => i.ativo !== false).map((i) => {
      const s = saldos.find((x) => x.insumo_id === i.id)
      let local = 0
      for (const m of movs.filter((x) => x.insumo_id === i.id && !x.excluido_em))
        local += m.movimento === 'Saída avulsa' ? -Number(m.quantidade) : Number(m.quantidade)
      for (const p of prods.filter((x) => x.insumo_id === i.id && !opsApagadas.has(x.operacao_id))) local -= Number(p.quantidade_total ?? 0)
      const saldo = Number(s?.saldo ?? 0) + local
      return { insumo: i, saldo, local, custo: s?.custo_medio ?? null, baixo: i.estoque_minimo != null && saldo < Number(i.estoque_minimo) }
    })
  })
}

export function Estoque() {
  const linhas = useSaldos()
  const [form, setForm] = useState(false)
  if (!linhas) return <p className="vazio">Carregando…</p>
  if (form) return <FormMovimento pronto={() => setForm(false)} />
  const valor = linhas.reduce((s, l) => s + (l.custo != null && l.saldo > 0 ? l.custo * l.saldo : 0), 0)
  return (
    <div className="tela">
      <h1>Estoque</h1>
      <p className="mudo">As pulverizações, plantios e adubações já descontam o estoque sozinhas. Aqui entram notas, saídas avulsas e inventário.</p>
      <button className="primario" onClick={() => setForm(true)}>+ Movimento de estoque</button>
      {linhas.length === 0 ? <Aviso>Nenhum insumo cadastrado ainda (Mais › Insumos).</Aviso> : (
        <div className="rolagem">
          <table className="tabela">
            <thead><tr><th>Insumo</th><th className="num">Saldo</th><th className="num">Mínimo</th><th className="num">Custo médio</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.insumo.id} className={l.baixo ? 'baixo' : ''}>
                  <td>{l.insumo.nome}<small className="mudo"> {l.insumo.tipo}</small></td>
                  <td className="num">{fmtN(l.saldo, 1)} {l.insumo.unidade}{l.local !== 0 && <small className="mudo" title="Inclui registros que ainda estão no celular"> *</small>}</td>
                  <td className="num">{fmtN(l.insumo.estoque_minimo, 1)}</td>
                  <td className="num">{l.custo != null ? `R$ ${fmtN(l.custo, 2)}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {valor > 0 && <p className="mudo">Valor em estoque (custo médio): <b>R$ {fmtN(valor, 0)}</b></p>}
      <Movimentos />
    </div>
  )
}

function FormMovimento({ pronto }: { pronto: () => void }) {
  const { eu } = useSessao()
  const insumos = useLive(() => db.insumos.orderBy('nome').toArray()) ?? []
  const [insumoId, setInsumoId] = useState('')
  const [mov, setMov] = useState<(typeof MOVIMENTOS)[number]>('Entrada')
  const [data, setData] = useState(hojeISO())
  const [qtd, setQtd] = useState('')
  const [valor, setValor] = useState('')
  const [nf, setNf] = useState('')
  const [forn, setForn] = useState('')
  const [obs, setObs] = useState('')
  const ins = insumos.find((i) => i.id === insumoId)
  const ref = referenciaInsumo(ins?.nome)
  const precoUn = ins?.preco_unitario != null ? Number(ins.preco_unitario) : ref?.preco != null && ref.unidade === ins?.unidade ? ref.preco : null
  const valorRef = precoUn != null && num(qtd) ? precoUn * num(qtd)! : null

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar('estoque_mov', [{
      id: uuid(), data, autor_id: eu.id, insumo_id: insumoId, movimento: mov, quantidade: num(qtd)!,
      valor_total: mov === 'Entrada' ? num(valor) : null, nota_fiscal: nf || null, fornecedor: forn || null, observacao: obs || null,
    }])
    pronto()
  }
  return (
    <form className="tela" onSubmit={enviar}>
      <button type="button" className="voltar" onClick={pronto}>‹ Estoque</button>
      <h1>Movimento de estoque</h1>
      <Escolha t="Tipo" opcoes={MOVIMENTOS} valor={mov} muda={setMov} />
      <Rotulo t="Insumo">
        <select required value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
          <option value="">Escolha…</option>
          {insumos.filter((i) => i.ativo !== false).map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
        </select>
      </Rotulo>
      <div className="duas">
        <Rotulo t={`Quantidade${ins ? ` (${ins.unidade})` : ''}`} dica={mov === 'Ajuste de inventário' ? 'Use negativo para baixar' : undefined}>
          <input inputMode="decimal" required value={qtd} onChange={(e) => setQtd(e.target.value)} />
        </Rotulo>
        <Rotulo t="Data"><input type="date" required value={data} onChange={(e) => setData(e.target.value)} /></Rotulo>
      </div>
      {mov === 'Entrada' && (
        <>
          <div className="duas">
            <Rotulo t="Valor total da nota (R$)" dica={valorRef != null ? `(${ins?.preco_unitario != null ? 'preço cadastrado' : 'padrão mercado'}: R$ ${fmtN(valorRef, 2)}${ins?.preco_unitario == null && ref ? ' · ' + precoMercado(ref) : ''})` : 'Calcula o custo médio e o custo por hectare'}>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={valorRef != null ? `(${fmtN(valorRef, 2)})` : ''} />
            </Rotulo>
            <Rotulo t="Nº da nota"><input value={nf} onChange={(e) => setNf(e.target.value)} /></Rotulo>
          </div>
          <Rotulo t="Fornecedor"><input value={forn} onChange={(e) => setForn(e.target.value)} /></Rotulo>
        </>
      )}
      <Rotulo t="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} /></Rotulo>
      <button className="primario fixo" disabled={!insumoId || num(qtd) == null}>Salvar</button>
    </form>
  )
}

/** Últimos movimentos lançados, para corrigir um lançamento errado. */
function Movimentos() {
  const { eu, gestor } = useSessao()
  const movs = useLive(async () => (await db.estoque_mov.orderBy('data').reverse().toArray()).filter((m) => !m.excluido_em).slice(0, 30))
  const insumos = useLive(() => db.insumos.toArray()) ?? []
  if (!movs?.length) return null
  const nome = (id: string) => insumos.find((i) => i.id === id)
  return (
    <section>
      <h2>Últimos movimentos</h2>
      <ul className="lista">
        {movs.map((m) => (
          <li key={m.id}>
            <b>{m.movimento}</b> · {nome(m.insumo_id)?.nome ?? 'insumo'} {fmtN(Number(m.quantidade), 2)} {nome(m.insumo_id)?.unidade}
            <small>{fmtData(m.data)}{m.valor_total != null ? ` · R$ ${fmtN(Number(m.valor_total), 2)}` : ''}{m.nota_fiscal ? ` · NF ${m.nota_fiscal}` : ''}{m.fornecedor ? ` · ${m.fornecedor}` : ''}</small>
            {(gestor || m.autor_id === eu.id) && (
              <BotaoApagar pergunta="Apagar este movimento?" detalhe="O saldo é recalculado. Dá para restaurar na Lixeira."
                aoConfirmar={() => void apagar('estoque_mov', [m.id]).then(() => mostrarDesfazer('Movimento apagado', () => void restaurar('estoque_mov', [m.id])))} />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
