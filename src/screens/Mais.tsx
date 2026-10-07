import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao } from '../lib/hooks'
import { CULTURAS, ESTADIOS_CANA, ESTADIOS_GRAOS, STATUS_CICLO, TIPOS_INSUMO, UNIDADES } from '../lib/opcoes'
import { fmtData, fmtDataHora, hojeISO, num, uuid } from '../lib/formato'
import { salvar } from '../lib/sync'
import { Aviso, Escolha, Rotulo } from '../components/ui'
import type { Ciclo, Insumo } from '../lib/tipos'

export function Mais({ ir }: { ir: (tela: string) => void }) {
  const { eu, gestor, sair } = useSessao()
  return (
    <div className="tela">
      <h1>Mais</h1>
      <div className="menu">
        {gestor && <button onClick={() => ir('safras')}><span className="icone">🌱</span><span><b>Safras</b><small>Cultura, cultivar, plantio, estádio e colheita por talhão</small></span></button>}
        {gestor && <button onClick={() => ir('insumos')}><span className="icone">🧪</span><span><b>Insumos</b><small>Produtos, unidade e estoque mínimo</small></span></button>}
        <button onClick={() => ir('equipe')}><span className="icone">👥</span><span><b>Equipe</b><small>Quem usa o app</small></span></button>
        <button onClick={() => ir('fila')}><span className="icone">📶</span><span><b>Envio</b><small>O que está guardado no celular</small></span></button>
      </div>
      <p className="mudo">Conectado como {eu.nome} ({eu.email}) · {eu.perfil}</p>
      <button className="secundario" onClick={sair}>Sair</button>
    </div>
  )
}

export function Safras({ voltar, abrir }: { voltar: () => void; abrir: (talhaoId: string, cicloId?: string) => void }) {
  const talhoes = useLive(() => db.talhoes.orderBy('nome').toArray()) ?? []
  const ciclos = useLive(() => db.ciclos.toArray()) ?? []
  return (
    <div className="tela">
      <button className="voltar" onClick={voltar}>‹ Mais</button>
      <h1>Safras</h1>
      {talhoes.length === 0 && <Aviso>Desenhe os talhões no Mapa primeiro.</Aviso>}
      {talhoes.map((t) => {
        const cs = ciclos.filter((c) => c.talhao_id === t.id).sort((a, b) => (b.data_plantio ?? b.safra).localeCompare(a.data_plantio ?? a.safra))
        return (
          <section key={t.id} className="cartao">
            <div className="topo"><b>{t.nome}</b><button className="mini" onClick={() => abrir(t.id)}>+ Safra</button></div>
            <ul className="lista">
              {cs.map((c) => (
                <li key={c.id} onClick={() => abrir(t.id, c.id)}>
                  <b>{c.safra}</b> · {c.cultura}{c.cultivar ? ` (${c.cultivar})` : ''}
                  <small>{c.status} · plantio {fmtData(c.data_plantio)}{c.estadio_atual ? ` · ${c.estadio_atual}` : ''}</small>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function FormCiclo({ talhaoId, cicloId, pronto }: { talhaoId: string; cicloId?: string; pronto: () => void }) {
  const talhao = useLive(() => db.talhoes.get(talhaoId), [talhaoId])
  const atual = useLive(() => (cicloId ? db.ciclos.get(cicloId) : Promise.resolve(undefined)), [cicloId])
  if (cicloId && !atual) return <p className="vazio">Carregando…</p>
  return <FormCicloCampos talhaoNome={talhao?.nome ?? ''} talhaoId={talhaoId} c={atual} pronto={pronto} />
}

function FormCicloCampos({ talhaoId, talhaoNome, c, pronto }: { talhaoId: string; talhaoNome: string; c?: Ciclo; pronto: () => void }) {
  const ano = new Date().getFullYear()
  const [f, setF] = useState<Record<string, string>>(() => ({
    safra: c?.safra ?? `Safra ${ano}/${String(ano + 1).slice(2)}`, cultura: c?.cultura ?? '', cultivar: c?.cultivar ?? '',
    ciclo_cultivar_dias: String(c?.ciclo_cultivar_dias ?? ''), data_plantio: c?.data_plantio ?? '',
    populacao_plantas_ha: String(c?.populacao_plantas_ha ?? ''), estadio_atual: c?.estadio_atual ?? '',
    data_estadio: c?.data_estadio ?? '', colheita_prevista: c?.colheita_prevista ?? '', data_colheita: c?.data_colheita ?? '',
    producao: String(c?.producao ?? ''), unidade_producao: c?.unidade_producao ?? '', meta_por_ha: String(c?.meta_por_ha ?? ''),
    corte_cana: String(c?.corte_cana ?? ''), atr_kg_t: String(c?.atr_kg_t ?? ''), status: c?.status ?? 'Planejado', observacao: c?.observacao ?? '',
  }))
  const s = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const cana = f.cultura === 'Cana-de-açúcar'
  const estadios = cana ? ESTADIOS_CANA : ESTADIOS_GRAOS

  async function gravar(e: FormEvent) {
    e.preventDefault()
    const status = f.data_colheita ? 'Colhido' : f.status === 'Planejado' && f.data_plantio && f.data_plantio <= hojeISO() ? 'Em andamento' : f.status
    await salvar('ciclos', [{
      id: c?.id ?? uuid(), talhao_id: talhaoId, safra: f.safra, cultura: f.cultura, cultivar: f.cultivar || null,
      ciclo_cultivar_dias: num(f.ciclo_cultivar_dias), data_plantio: f.data_plantio || null,
      populacao_plantas_ha: num(f.populacao_plantas_ha), estadio_atual: f.estadio_atual || null,
      data_estadio: f.estadio_atual ? (f.estadio_atual !== c?.estadio_atual ? hojeISO() : f.data_estadio || hojeISO()) : null,
      colheita_prevista: f.colheita_prevista || null, data_colheita: f.data_colheita || null,
      producao: num(f.producao), unidade_producao: num(f.producao) != null ? (f.unidade_producao || (cana ? 't' : 'sc')) : null,
      meta_por_ha: num(f.meta_por_ha), corte_cana: cana ? num(f.corte_cana) : null, atr_kg_t: cana ? num(f.atr_kg_t) : null,
      status, observacao: f.observacao || null,
    }])
    pronto()
  }

  return (
    <form className="tela" onSubmit={gravar}>
      <button type="button" className="voltar" onClick={pronto}>‹ Voltar</button>
      <h1>{c ? 'Safra' : 'Nova safra'} · {talhaoNome}</h1>
      <div className="duas">
        <Rotulo t="Safra"><input required value={f.safra} onChange={(e) => s('safra')(e.target.value)} list="safras" /></Rotulo>
        <Escolha t="Situação" opcoes={STATUS_CICLO} valor={f.status as Ciclo['status']} muda={s('status')} />
      </div>
      <datalist id="safras">{[`Safra ${ano}/${String(ano + 1).slice(2)}`, `Safrinha ${ano + 1}`, `Cana ${ano}/${String(ano + 1).slice(2)}`].map((x) => <option key={x} value={x} />)}</datalist>
      <Escolha t="Cultura" opcoes={CULTURAS} valor={f.cultura as (typeof CULTURAS)[number]} muda={s('cultura')} />
      <div className="duas">
        <Rotulo t="Cultivar / variedade"><input value={f.cultivar} onChange={(e) => s('cultivar')(e.target.value)} /></Rotulo>
        <Rotulo t="Ciclo da cultivar (dias)"><input inputMode="numeric" value={f.ciclo_cultivar_dias} onChange={(e) => s('ciclo_cultivar_dias')(e.target.value)} /></Rotulo>
      </div>
      <div className="duas">
        <Rotulo t={cana ? 'Plantio / último corte' : 'Data de plantio'}><input type="date" value={f.data_plantio} onChange={(e) => s('data_plantio')(e.target.value)} /></Rotulo>
        {!cana && <Rotulo t="População (plantas/ha)"><input inputMode="numeric" value={f.populacao_plantas_ha} onChange={(e) => s('populacao_plantas_ha')(e.target.value)} /></Rotulo>}
        {cana && <Rotulo t="Corte nº"><input inputMode="numeric" value={f.corte_cana} onChange={(e) => s('corte_cana')(e.target.value)} /></Rotulo>}
      </div>
      <Escolha t="Estádio atual" opcoes={estadios} valor={f.estadio_atual} muda={s('estadio_atual')} />
      <fieldset>
        <legend>Colheita e produção</legend>
        <div className="duas">
          <Rotulo t="Colheita prevista" dica="Em branco: plantio + ciclo da cultivar"><input type="date" value={f.colheita_prevista} onChange={(e) => s('colheita_prevista')(e.target.value)} /></Rotulo>
          <Rotulo t="Meta por ha"><input inputMode="decimal" value={f.meta_por_ha} onChange={(e) => s('meta_por_ha')(e.target.value)} placeholder={cana ? 't/ha' : 'sc/ha'} /></Rotulo>
        </div>
        <div className="duas">
          <Rotulo t="Colhido em"><input type="date" value={f.data_colheita} onChange={(e) => s('data_colheita')(e.target.value)} /></Rotulo>
          <Rotulo t={`Produção total (${f.unidade_producao || (cana ? 't' : 'sc')})`}><input inputMode="decimal" value={f.producao} onChange={(e) => s('producao')(e.target.value)} /></Rotulo>
        </div>
        {cana && <Rotulo t="ATR (kg/t)"><input inputMode="decimal" value={f.atr_kg_t} onChange={(e) => s('atr_kg_t')(e.target.value)} /></Rotulo>}
      </fieldset>
      <Rotulo t="Observação"><input value={f.observacao} onChange={(e) => s('observacao')(e.target.value)} /></Rotulo>
      <button className="primario fixo" disabled={!f.cultura || !f.safra}>Salvar safra</button>
    </form>
  )
}

export function Insumos({ voltar }: { voltar: () => void }) {
  const lista = useLive(() => db.insumos.orderBy('nome').toArray()) ?? []
  const [edit, setEdit] = useState<Partial<Insumo> | null>(null)
  if (edit) return <FormInsumo i={edit} pronto={() => setEdit(null)} />
  return (
    <div className="tela">
      <button className="voltar" onClick={voltar}>‹ Mais</button>
      <h1>Insumos</h1>
      <button className="primario" onClick={() => setEdit({})}>+ Insumo</button>
      <ul className="lista">
        {lista.map((i) => (
          <li key={i.id} onClick={() => setEdit(i)} className={i.ativo === false ? 'mudo' : ''}>
            <b>{i.nome}</b><small>{i.tipo} · {i.unidade}{i.estoque_minimo != null ? ` · mínimo ${i.estoque_minimo}` : ''}{i.ativo === false ? ' · inativo' : ''}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FormInsumo({ i, pronto }: { i: Partial<Insumo>; pronto: () => void }) {
  const [nome, setNome] = useState(i.nome ?? '')
  const [tipo, setTipo] = useState(i.tipo ?? '')
  const [unidade, setUnidade] = useState(i.unidade ?? '')
  const [minimo, setMinimo] = useState(String(i.estoque_minimo ?? ''))
  const [ativo, setAtivo] = useState(i.ativo ?? true)
  async function gravar(e: FormEvent) {
    e.preventDefault()
    await salvar('insumos', [{ id: i.id ?? uuid(), nome: nome.trim(), tipo, unidade, estoque_minimo: num(minimo), ativo }])
    pronto()
  }
  return (
    <form className="tela" onSubmit={gravar}>
      <button type="button" className="voltar" onClick={pronto}>‹ Insumos</button>
      <h1>{i.id ? 'Insumo' : 'Novo insumo'}</h1>
      <Rotulo t="Nome comercial"><input required value={nome} onChange={(e) => setNome(e.target.value)} /></Rotulo>
      <Escolha t="Tipo" opcoes={TIPOS_INSUMO} valor={tipo as (typeof TIPOS_INSUMO)[number]} muda={setTipo} />
      <Escolha t="Unidade de estoque" dica="A dose por hectare usa esta mesma unidade" opcoes={UNIDADES} valor={unidade as (typeof UNIDADES)[number]} muda={setUnidade} />
      <Rotulo t="Estoque mínimo" dica="Abaixo disso aparece alerta no início"><input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} /></Rotulo>
      <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Em uso</label>
      <button className="primario fixo" disabled={!nome.trim() || !tipo || !unidade}>Salvar</button>
    </form>
  )
}

export function Equipe({ voltar }: { voltar: () => void }) {
  const pessoas = useLive(() => db.pessoas.toArray()) ?? []
  const { dono } = useSessao()
  return (
    <div className="tela">
      <button className="voltar" onClick={voltar}>‹ Mais</button>
      <h1>Equipe</h1>
      <ul className="lista">
        {pessoas.map((p) => <li key={p.id}><b>{p.nome}</b><small>{p.email} · {p.perfil}{p.ativo ? '' : ' · inativo'}</small></li>)}
      </ul>
      {dono && <Aviso>Para liberar alguém: a pessoa cria a conta no app com o próprio e-mail e você me avisa o nome e a função. A tela de convite entra numa próxima versão.</Aviso>}
    </div>
  )
}

export function Fila({ voltar }: { voltar: () => void }) {
  const itens = useLive(() => db.fila.orderBy('seq').toArray()) ?? []
  return (
    <div className="tela">
      <button className="voltar" onClick={voltar}>‹ Mais</button>
      <h1>Envio</h1>
      {itens.length === 0 ? <Aviso tipo="ok">Nada pendente. Tudo já está no servidor.</Aviso> : (
        <ul className="lista">
          {itens.map((i) => (
            <li key={i.seq} className={i.erro ? 'alerta' : ''}>
              <b>{i.tabela.replace('_', ' ')}</b> · {i.linhas.length} linha(s)
              <small>Gravado {fmtDataHora(i.criado_em)}{i.erro ? ` · servidor recusou: ${i.erro}` : ' · aguardando sinal'}</small>
              {i.erro && <button className="mini" onClick={() => void db.fila.delete(i.seq!)}>Descartar</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
