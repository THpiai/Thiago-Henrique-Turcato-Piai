import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useLive, useSessao } from '../lib/hooks'
import { CULTURAS, ESTADIOS_CANA, ESTADIOS_GRAOS, STATUS_CICLO, TIPOS_INSUMO, UNIDADES } from '../lib/opcoes'
import { fmtData, fmtDataHora, fmtN, hojeISO, num, uuid } from '../lib/formato'
import type { TabelaSync } from '../lib/db'
import { apagar, restaurar, salvar } from '../lib/sync'
import { BotaoApagar, mostrarDesfazer } from '../components/Apagar'
import { Aviso, Escolha, Rotulo } from '../components/ui'
import { Icone } from '../components/Icone'
import { CLASSES_INSUMO } from '../lib/problemas'
import { doseMercado, INSUMOS_MERCADO, precoMercado, referenciaCultura, referenciaInsumo } from '../lib/mercado'
import type { Ciclo, Insumo } from '../lib/tipos'

export function Mais({ ir }: { ir: (tela: string) => void }) {
  const { eu, gestor, sair } = useSessao()
  return (
    <div className="tela">
      <h1>Mais</h1>
      <div className="menu">
        <button onClick={() => ir('mapa')}><span className="icone"><Icone n="mapa" t={26} /></span><span><b>Mapa dos talhões</b><small>Desenhar e ajustar os contornos</small></span></button>
        {gestor && <button onClick={() => ir('safras')}><span className="icone"><Icone n="folha" t={26} /></span><span><b>Safras</b><small>Cultura, cultivar, plantio, estádio e colheita por talhão</small></span></button>}
        {gestor && <button onClick={() => ir('insumos')}><span className="icone"><Icone n="frasco" t={26} /></span><span><b>Insumos</b><small>Produtos, classe, unidade e estoque mínimo</small></span></button>}
        <button onClick={() => ir('equipe')}><span className="icone"><Icone n="pessoas" t={26} /></span><span><b>Equipe</b><small>Quem usa o app</small></span></button>
        <button onClick={() => ir('lixeira')}><span className="icone"><Icone n="lixo" t={26} /></span><span><b>Lixeira</b><small>Registros apagados e talhões arquivados</small></span></button>
        <button onClick={() => ir('fila')}><span className="icone"><Icone n="sinal" t={26} /></span><span><b>Envio</b><small>O que está guardado no celular</small></span></button>
      </div>
      <p className="mudo">Conectado como {eu.nome} ({eu.email}) · {eu.perfil}</p>
      <button className="secundario" onClick={sair}>Sair</button>
    </div>
  )
}

export function Safras({ voltar, abrir }: { voltar: () => void; abrir: (talhaoId: string, cicloId?: string) => void }) {
  const talhoes = useLive(() => db.talhoes.orderBy('nome').toArray()) ?? []
  const ciclos = (useLive(() => db.ciclos.toArray()) ?? []).filter((c) => !c.excluido_em)
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
    safra: c?.safra ?? `Soja ${ano}/${String(ano + 1).slice(2)}`, cultura: c?.cultura ?? '', cultivar: c?.cultivar ?? '',
    ciclo_cultivar_dias: String(c?.ciclo_cultivar_dias ?? ''), data_plantio: c?.data_plantio ?? '',
    populacao_plantas_ha: String(c?.populacao_plantas_ha ?? ''), estadio_atual: c?.estadio_atual ?? '',
    data_estadio: c?.data_estadio ?? '', colheita_prevista: c?.colheita_prevista ?? '', data_colheita: c?.data_colheita ?? '',
    producao: String(c?.producao ?? ''), unidade_producao: c?.unidade_producao ?? '', meta_por_ha: String(c?.meta_por_ha ?? ''),
    corte_cana: String(c?.corte_cana ?? ''), atr_kg_t: String(c?.atr_kg_t ?? ''), status: c?.status ?? 'Planejado', observacao: c?.observacao ?? '',
  }))
  const s = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const cana = f.cultura === 'Cana-de-açúcar'
  const estadios = cana ? ESTADIOS_CANA : ESTADIOS_GRAOS
  const ref = f.cultura ? referenciaCultura(f.cultura, f.safra) : undefined
  const ph = (v?: number | null, u = '') => (v != null ? `(padrão mercado: ${fmtN(v)}${u})` : '')

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
      <datalist id="safras">{[`Soja ${ano}/${String(ano + 1).slice(2)}`, `Safrinha ${ano + 1}`, `Cana ${ano}/${String(ano + 1).slice(2)}`].map((x) => <option key={x} value={x} />)}</datalist>
      <Escolha t="Cultura" opcoes={CULTURAS} valor={f.cultura as (typeof CULTURAS)[number]} muda={s('cultura')} />
      <div className="duas">
        <Rotulo t="Cultivar / variedade"><input value={f.cultivar} onChange={(e) => s('cultivar')(e.target.value)} /></Rotulo>
        <Rotulo t="Ciclo da cultivar (dias)" dica={ref?.ciclo_dias ? 'Em branco: usa o padrão mercado' : undefined}><input inputMode="numeric" value={f.ciclo_cultivar_dias} onChange={(e) => s('ciclo_cultivar_dias')(e.target.value)} placeholder={ph(ref?.ciclo_dias, ' dias')} /></Rotulo>
      </div>
      <div className="duas">
        <Rotulo t={cana ? 'Plantio / último corte' : 'Data de plantio'}><input type="date" value={f.data_plantio} onChange={(e) => s('data_plantio')(e.target.value)} /></Rotulo>
        {!cana && <Rotulo t="População (plantas/ha)"><input inputMode="numeric" value={f.populacao_plantas_ha} onChange={(e) => s('populacao_plantas_ha')(e.target.value)} placeholder={ph(ref?.populacao_ha)} /></Rotulo>}
        {cana && <Rotulo t="Corte nº"><input inputMode="numeric" value={f.corte_cana} onChange={(e) => s('corte_cana')(e.target.value)} /></Rotulo>}
      </div>
      <p className="dica">Plantio, cultivar, produção e colheita também se preenchem sozinhos pelas operações registradas no talhão. O estádio, quando não anotado nos últimos 15 dias, é estimado pelos dias de plantio.</p>
      <Escolha t="Estádio atual" opcoes={estadios} valor={f.estadio_atual} muda={s('estadio_atual')} />
      <fieldset>
        <legend>Colheita e produção</legend>
        <div className="duas">
          <Rotulo t="Colheita prevista" dica="Em branco: plantio + ciclo da cultivar"><input type="date" value={f.colheita_prevista} onChange={(e) => s('colheita_prevista')(e.target.value)} /></Rotulo>
          <Rotulo t="Meta por ha"><input inputMode="decimal" value={f.meta_por_ha} onChange={(e) => s('meta_por_ha')(e.target.value)} placeholder={ph(ref?.produtividade_ha, cana ? ' t/ha' : ' sc/ha') || (cana ? 't/ha' : 'sc/ha')} /></Rotulo>
        </div>
        <div className="duas">
          <Rotulo t="Colhido em"><input type="date" value={f.data_colheita} onChange={(e) => s('data_colheita')(e.target.value)} /></Rotulo>
          <Rotulo t={`Produção total (${f.unidade_producao || (cana ? 't' : 'sc')})`}><input inputMode="decimal" value={f.producao} onChange={(e) => s('producao')(e.target.value)} /></Rotulo>
        </div>
        {cana && <Rotulo t="ATR (kg/t)"><input inputMode="decimal" value={f.atr_kg_t} onChange={(e) => s('atr_kg_t')(e.target.value)} /></Rotulo>}
      </fieldset>
      <Rotulo t="Observação"><input value={f.observacao} onChange={(e) => s('observacao')(e.target.value)} /></Rotulo>
      <button className="primario fixo" disabled={!f.cultura || !f.safra}>Salvar safra</button>
      {c && (
        <section className="zona-perigo">
          <BotaoApagar rotulo="Apagar safra" pergunta={`Apagar ${c.safra} (${c.cultura})?`}
            detalhe="As operações continuam no talhão. Dá para restaurar na Lixeira."
            aoConfirmar={() => void apagar('ciclos', [c.id]).then(() => { mostrarDesfazer('Safra apagada', () => void restaurar('ciclos', [c.id])); pronto() })} />
        </section>
      )}
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
            <b>{i.nome}</b><small>{i.classe ?? <span className="falta">sem classe</span>} · {i.tipo} · {i.unidade}{i.ingrediente_ativo ? ` · ${i.ingrediente_ativo}` : ''}{i.estoque_minimo != null ? ` · mínimo ${i.estoque_minimo}` : ''}{i.ativo === false ? ' · inativo' : ''}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FormInsumo({ i, pronto }: { i: Partial<Insumo>; pronto: () => void }) {
  const [f, setF] = useState<Record<string, string>>(() => ({
    nome: i.nome ?? '', tipo: i.tipo ?? '', unidade: i.unidade ?? '', minimo: String(i.estoque_minimo ?? ''),
    fabricante: i.fabricante ?? '', ingrediente_ativo: i.ingrediente_ativo ?? '', classe: i.classe ?? '',
    dose: i.dose_ha_padrao != null ? String(i.dose_ha_padrao).replace('.', ',') : '',
    preco: i.preco_unitario != null ? String(i.preco_unitario).replace('.', ',') : '',
  }))
  const [ativo, setAtivo] = useState(i.ativo ?? true)
  const s = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const ref = referenciaInsumo(f.nome)
  const doseRef = ref ? (ref.dose_min_ha != null && ref.dose_max_ha != null ? (ref.dose_min_ha + ref.dose_max_ha) / 2 : ref.dose_min_ha ?? ref.dose_max_ha ?? null) : null
  const pad: Record<string, string | null> = {
    fabricante: ref?.fabricante ?? null, ingrediente_ativo: ref?.ingrediente_ativo ?? null, classe: classeEscolha(ref?.classe),
    tipo: ref?.tipo ?? null, unidade: ref?.unidade ?? null,
    dose: doseRef != null ? String(Math.round(doseRef * 1000) / 1000).replace('.', ',') : null,
    preco: ref?.preco != null ? String(ref.preco).replace('.', ',') : null,
  }
  const vazios = Object.keys(pad).filter((k) => pad[k] && !f[k])
  const usarTudo = () => setF((x) => ({ ...x, ...Object.fromEntries(vazios.map((k) => [k, pad[k]!])) }))

  async function gravar(e: FormEvent) {
    e.preventDefault()
    await salvar('insumos', [{
      id: i.id ?? uuid(), nome: f.nome.trim(), tipo: f.tipo, unidade: f.unidade, estoque_minimo: num(f.minimo), ativo,
      fabricante: f.fabricante || null, ingrediente_ativo: f.ingrediente_ativo || null, classe: f.classe || null,
      dose_ha_padrao: num(f.dose), preco_unitario: num(f.preco),
    }])
    pronto()
  }
  const Pad = ({ k, txt }: { k: string; txt?: string | null }) =>
    pad[k] && !f[k] ? <button type="button" className="mercado" onClick={() => s(k)(pad[k]!)}>(padrão mercado: {txt ?? pad[k]}) usar</button> : null

  return (
    <form className="tela" onSubmit={gravar}>
      <button type="button" className="voltar" onClick={pronto}>‹ Insumos</button>
      <h1>{i.id ? 'Insumo' : 'Novo insumo'}</h1>
      <Rotulo t="Nome comercial" dica="Comece a digitar: os produtos mais usados já têm dados de mercado">
        <input required value={f.nome} onChange={(e) => s('nome')(e.target.value)} list="mercado-insumos" autoComplete="off" />
      </Rotulo>
      <datalist id="mercado-insumos">{INSUMOS_MERCADO.map((r) => <option key={r.nome} value={r.nome}>{r.ingrediente_ativo ?? ''}</option>)}</datalist>
      {ref && (
        <div className="ref-mercado">
          <b>Padrão mercado encontrado:</b> {ref.nome}{ref.ingrediente_ativo ? ` · ${ref.ingrediente_ativo}` : ''}
          <small>{[doseMercado(ref) && `Dose de bula ${doseMercado(ref)}`, precoMercado(ref)].filter(Boolean).join(' · ') || 'Sem dose ou preço na base'}</small>
          {vazios.length > 0 && <button type="button" className="secundario" onClick={usarTudo}>Preencher o que está vazio</button>}
        </div>
      )}
      <Escolha t="Tipo" opcoes={TIPOS_INSUMO} valor={f.tipo as (typeof TIPOS_INSUMO)[number]} muda={s('tipo')} />
      <Pad k="tipo" />
      <Escolha t="Unidade de estoque" dica="A dose por hectare usa esta mesma unidade" opcoes={UNIDADES} valor={f.unidade as (typeof UNIDADES)[number]} muda={s('unidade')} />
      <Pad k="unidade" />
      <div className="duas">
        <div><Rotulo t="Fabricante"><input value={f.fabricante} onChange={(e) => s('fabricante')(e.target.value)} placeholder={pad.fabricante ? `(${pad.fabricante})` : ''} /></Rotulo><Pad k="fabricante" /></div>
      </div>
      <Escolha t="Classe" dica="O app usa a classe para saber que uma aplicação está tratando um problema (inseticida para praga, herbicida para daninha, fungicida para doença)"
        opcoes={CLASSES} valor={f.classe} muda={s('classe')} />
      <Pad k="classe" />
      <Rotulo t="Ingrediente ativo"><input value={f.ingrediente_ativo} onChange={(e) => s('ingrediente_ativo')(e.target.value)} placeholder={pad.ingrediente_ativo ? `(${pad.ingrediente_ativo})` : ''} /></Rotulo>
      <Pad k="ingrediente_ativo" />
      <div className="duas">
        <div>
          <Rotulo t={`Dose padrão (${f.unidade || 'un'}/ha)`} dica="Sugerida ao registrar a operação">
            <input inputMode="decimal" value={f.dose} onChange={(e) => s('dose')(e.target.value)} placeholder={ref ? `(${doseMercado(ref) ?? ''})` : ''} />
          </Rotulo>
          <Pad k="dose" txt={doseMercado(ref)} />
        </div>
        <div>
          <Rotulo t={`Preço (R$/${f.unidade || 'un'})`} dica="Usado no custo/ha enquanto não houver entrada com nota">
            <input inputMode="decimal" value={f.preco} onChange={(e) => s('preco')(e.target.value)} placeholder={pad.preco ? `(${pad.preco})` : ''} />
          </Rotulo>
          <Pad k="preco" txt={precoMercado(ref)} />
        </div>
      </div>
      <Rotulo t="Estoque mínimo" dica="Abaixo disso aparece alerta no início"><input inputMode="decimal" value={f.minimo} onChange={(e) => s('minimo')(e.target.value)} /></Rotulo>
      <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Em uso</label>
      {ref?.preco_url && <p className="fonte">Fonte do preço: <a href={ref.preco_url} target="_blank" rel="noreferrer">{ref.preco_fonte ?? 'link'}</a>{ref.preco_data ? ` (${ref.preco_data})` : ''}. Valores de referência, confira com sua revenda.</p>}
      <button className="primario fixo" disabled={!f.nome.trim() || !f.tipo || !f.unidade || !f.classe}>Salvar</button>
    </form>
  )
}
const CLASSES = [...CLASSES_INSUMO] as string[]
/** Classe da base de mercado no nome da lista do app (ex.: "Adubo NPK" vira "Adubo"). */
function classeEscolha(c?: string | null): string | null {
  if (!c) return null
  if (CLASSES.includes(c)) return c
  if (/^adubo/i.test(c)) return 'Adubo'
  if (/calc|gesso/i.test(c)) return 'Corretivo'
  if (/diesel/i.test(c)) return 'Combustível'
  if (/muda|semente/i.test(c)) return /trat/i.test(c) ? 'Tratamento de sementes' : 'Semente'
  return 'Outro'
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
      {dono && <Aviso>Para liberar alguém: me avise o e-mail, o nome e a função da pessoa. Só depois do convite ela consegue criar a conta no app (cadastro sem convite é recusado).</Aviso>}
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

type ItemLixeira = { id: string; tabela: TabelaSync; tipo: string; titulo: string; detalhe: string; quando: string }

/** Tudo que foi apagado ou arquivado, com opção de restaurar. */
export function Lixeira({ voltar }: { voltar: () => void }) {
  const { eu, gestor } = useSessao()
  const itens = useLive(async (): Promise<ItemLixeira[]> => {
    const talhoes = await db.talhoes.toArray()
    const nomeT = (id?: string | null) => talhoes.find((t) => t.id === id)?.nome ?? ''
    const insumos = await db.insumos.toArray()
    const meu = (a?: string | null) => gestor || a === eu.id
    const fora = <T extends { excluido_em?: string | null }>(l: T[]) => l.filter((x) => !!x.excluido_em)
    return [
      ...(gestor ? talhoes.filter((t) => t.ativo === false).map((t) => ({ id: t.id, tabela: 'talhoes' as const, tipo: 'Talhão arquivado', titulo: t.nome, detalhe: `${fmtN(Number(t.area_ha), 2)} ha`, quando: '' })) : []),
      ...fora(await db.operacoes.toArray()).filter((o) => meu(o.autor_id)).map((o) => ({ id: o.id, tabela: 'operacoes' as const, tipo: 'Operação', titulo: `${o.tipo}${o.alvo ? ' · ' + o.alvo : ''}`, detalhe: `${nomeT(o.talhao_id)} · ${fmtDataHora(o.data_hora)}`, quando: o.excluido_em! })),
      ...fora(await db.campo.toArray()).filter((c) => meu(c.autor_id)).map((c) => ({ id: c.id, tabela: 'campo' as const, tipo: 'Problema', titulo: `${c.tipo}${c.alvo ? ' · ' + c.alvo : ''}`, detalhe: `${nomeT(c.talhao_id)} · ${fmtDataHora(c.data_hora)}`, quando: c.excluido_em! })),
      ...fora(await db.chuva.toArray()).filter((c) => meu(c.autor_id)).map((c) => ({ id: c.id, tabela: 'chuva' as const, tipo: 'Chuva', titulo: `${fmtN(Number(c.milimetros), 1)} mm`, detalhe: `${nomeT(c.talhao_id)} · ${fmtData(c.data)}`, quando: c.excluido_em! })),
      ...fora(await db.estoque_mov.toArray()).filter((m) => meu(m.autor_id)).map((m) => ({ id: m.id, tabela: 'estoque_mov' as const, tipo: 'Estoque', titulo: `${m.movimento} · ${insumos.find((i) => i.id === m.insumo_id)?.nome ?? ''}`, detalhe: `${fmtN(Number(m.quantidade), 2)} · ${fmtData(m.data)}`, quando: m.excluido_em! })),
      ...(gestor ? fora(await db.ciclos.toArray()).map((c) => ({ id: c.id, tabela: 'ciclos' as const, tipo: 'Safra', titulo: `${c.safra} · ${c.cultura}`, detalhe: nomeT(c.talhao_id), quando: c.excluido_em! })) : []),
    ].sort((a, b) => b.quando.localeCompare(a.quando))
  }, [gestor, eu.id])
  return (
    <div className="tela">
      <button className="voltar" onClick={voltar}>‹ Mais</button>
      <h1>Lixeira</h1>
      <p className="mudo">O que foi apagado não entra no painel, no estoque nem no custo. Restaurar devolve tudo como estava.</p>
      {!itens ? null : itens.length === 0 ? <Aviso tipo="ok">A lixeira está vazia.</Aviso> : (
        <ul className="lista">
          {itens.map((i) => (
            <li key={i.tabela + i.id}>
              <span className="tag">{i.tipo}</span> <b>{i.titulo}</b>
              <small>{i.detalhe}{i.quando ? ` · apagado em ${fmtDataHora(i.quando)}` : ''}</small>
              <button className="mini" onClick={() => void restaurar(i.tabela, [i.id])}>Restaurar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
