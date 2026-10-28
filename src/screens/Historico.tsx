import { useMemo, useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import { useGravar, useIds, useLive } from '../lib/hooks'
import { fmtN, num } from '../lib/formato'
import { salvar } from '../lib/sync'
import { grupoSafra } from '../lib/safra'
import { referenciaCultura } from '../lib/mercado'
import { Aviso, Escolha, Rotulo } from '../components/ui'
import type { Ciclo, Talhao } from '../lib/tipos'

const FAMILIAS = ['Soja', 'Safrinha', 'Cana'] as const
type Familia = (typeof FAMILIAS)[number]
const par = (a: number) => `${a}/${String(a + 1).slice(2)}`

/** Nome gravado (igual ao do banco) e nome do conjunto que aparece na aba Safra. */
function nomes(f: Familia, a: number) {
  if (f === 'Soja') return { gravado: `Safra ${par(a)}`, grupo: `Soja ${par(a)}` }
  if (f === 'Safrinha') return { gravado: `Safrinha ${a}`, grupo: `Safrinha ${a}` }
  return { gravado: `Cana ${par(a)}`, grupo: `Cana ${par(a)}` }
}
/** Datas aproximadas de plantio e colheita de cada família (dá para trocar). */
function datasPadrao(f: Familia, a: number) {
  if (f === 'Soja') return { plantio: `${a}-10-20`, colheita: `${a + 1}-02-20` }
  if (f === 'Safrinha') return { plantio: `${a}-02-25`, colheita: `${a}-07-10` }
  return { plantio: '', colheita: `${a}-08-15` }
}

type Linha = { incluir: boolean; cultura: string; area: string; prod: string; custo: string; cultivar: string; atr: string; corte: string }

/**
 * Lançamento rápido de safras passadas: uma safra, todos os talhões de uma vez.
 * Grava como safra colhida, com produção, área, custo de insumos/ha e cultivar, para comparar no Rendimento.
 */
export function Historico({ voltar }: { voltar: () => void }) {
  const tLidos = useLive(() => db.talhoes.orderBy('nome').toArray())
  const cLidos = useLive(() => db.ciclos.toArray())
  const hoje = new Date().getFullYear()
  const [familia, setFamilia] = useState<Familia>('Soja')
  const [ano, setAno] = useState(hoje - 1)
  // O formulário só nasce com os dados lidos: abre já com os números da safra lançada antes.
  if (!tLidos || !cLidos) return <p className="vazio">Carregando…</p>
  const talhoes = tLidos.filter((t) => t.ativo !== false)
  const ciclos = cLidos.filter((c) => !c.excluido_em)
  if (!talhoes.length) return <div className="tela"><button className="voltar" onClick={voltar}>‹ Voltar</button><h1>Safras passadas</h1><Aviso>Desenhe os talhões no Mapa primeiro.</Aviso></div>
  // A chave remonta o formulário ao trocar a safra: cada safra tem seus próprios números.
  return <Formulario key={`${familia}-${ano}`} {...{ talhoes, ciclos, familia, ano, setFamilia, setAno, voltar, hoje }} />
}

function Formulario({ talhoes, ciclos, familia, ano, setFamilia, setAno, voltar, hoje }: {
  talhoes: Talhao[]; ciclos: Ciclo[]; familia: Familia; ano: number; hoje: number
  setFamilia: (f: Familia) => void; setAno: (a: number) => void; voltar: () => void
}) {
  const { gravado, grupo } = nomes(familia, ano)
  const cana = familia === 'Cana'
  const culturaPadrao = familia === 'Soja' ? 'Soja' : familia === 'Safrinha' ? 'Milho' : 'Cana-de-açúcar'
  const existente = useMemo(() => new Map(talhoes.map((t) => [t.id, ciclos.filter((c) => c.talhao_id === t.id && grupoSafra(c) === grupo)
    .sort((a, b) => (b.data_plantio ?? '').localeCompare(a.data_plantio ?? ''))[0]])), [talhoes, ciclos, grupo])
  const padrao = datasPadrao(familia, ano)
  const algum = [...existente.values()].find(Boolean)
  const [plantio, setPlantio] = useState(algum?.data_plantio ?? padrao.plantio)
  const [colheita, setColheita] = useState(algum?.data_colheita ?? padrao.colheita)
  const [linhas, setLinhas] = useState<Record<string, Linha>>(() => Object.fromEntries(talhoes.map((t) => {
    const c = existente.get(t.id)
    const area = Number(c?.area_ha ?? t.area_ha)
    return [t.id, {
      incluir: !!c, cultura: c?.cultura ?? culturaPadrao, area: c?.area_ha != null ? String(c.area_ha) : '',
      prod: c?.producao != null && area > 0 ? String(Math.round((Number(c.producao) / area) * 10) / 10) : '',
      custo: c?.custo_insumos_ha != null ? String(c.custo_insumos_ha) : '', cultivar: c?.cultivar ?? '',
      atr: c?.atr_kg_t != null ? String(c.atr_kg_t) : '', corte: c?.corte_cana != null ? String(c.corte_cana) : '',
    }]
  })))
  const muda = (id: string, k: keyof Linha, v: string | boolean) =>
    setLinhas((x) => ({ ...x, [id]: { ...x[id], [k]: v, ...(k !== 'incluir' && v !== '' ? { incluir: true } : {}) } }))
  // Safra que ainda está em campo no app não entra aqui (os números vêm das operações).
  const emCampo = (id: string) => { const c = existente.get(id); return !!c && c.status !== 'Colhido' && !c.producao }
  const id = useIds()
  const { salvando, gravar } = useGravar()
  const unid = cana ? 't' : 'sc'
  const escolhidos = talhoes.filter((t) => linhas[t.id]?.incluir && !emCampo(t.id))
  const ref = referenciaCultura(culturaPadrao, gravado)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const rows = escolhidos.map((t) => {
      const l = linhas[t.id], c = existente.get(t.id)
      const area = num(l.area) ?? Number(t.area_ha)
      const prod = num(l.prod)
      return {
        ...(c ? Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('_'))) : {}),
        id: c?.id ?? id(t.id), talhao_id: t.id, safra: c?.safra ?? gravado, cultura: l.cultura,
        cultivar: l.cultivar.trim() || null, data_plantio: plantio || null, data_colheita: colheita || null,
        producao: prod != null ? Math.round(prod * area * 100) / 100 : null, unidade_producao: prod != null ? unid : null,
        area_ha: num(l.area) != null && Math.abs(area - Number(t.area_ha)) > 0.005 ? area : null,
        custo_insumos_ha: num(l.custo), status: 'Colhido',
        atr_kg_t: cana ? num(l.atr) : null, corte_cana: cana ? num(l.corte) : null,
      }
    })
    if (await gravar(() => salvar('ciclos', rows), `${grupo} salva`)) voltar()
  }

  const anos = Array.from({ length: 12 }, (_, i) => (familia === 'Safrinha' ? hoje : hoje - 1) - i)
  return (
    <form className="tela historico" onSubmit={enviar}>
      <button type="button" className="voltar" onClick={voltar}>‹ Voltar</button>
      <h1>Safras passadas</h1>
      <p className="mudo">Lance o resultado de safras que não foram registradas no app. Elas entram no Rendimento para comparar com a média da fazenda, a safra anterior e a média regional.</p>
      <div className="duas">
        <Escolha t="Safra" opcoes={FAMILIAS} valor={familia} muda={setFamilia} />
        <Rotulo t="Ano">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anos.map((a) => <option key={a} value={a}>{familia === 'Safrinha' ? a : par(a)}</option>)}
          </select>
        </Rotulo>
      </div>
      <div className="duas">
        <Rotulo t={cana ? 'Último corte antes (aprox.)' : 'Plantio (aprox.)'}><input type="date" value={plantio} onChange={(e) => setPlantio(e.target.value)} /></Rotulo>
        <Rotulo t={cana ? 'Corte (aprox.)' : 'Colheita (aprox.)'}><input type="date" value={colheita} onChange={(e) => setColheita(e.target.value)} /></Rotulo>
      </div>

      <h2>{grupo} por talhão</h2>
      <p className="dica">Preencha só os talhões que tiveram essa safra. Produtividade em {unid}/ha{ref?.produtividade_ha ? ` (média regional: ${fmtN(ref.produtividade_ha, 1)})` : ''}; área em branco usa a do talhão; custo de insumos é opcional.</p>
      <ul className="lista-historico">
        {talhoes.map((t) => {
          const l = linhas[t.id]
          if (!l) return null
          const travado = emCampo(t.id)
          return (
            <li key={t.id} className={l.incluir && !travado ? 'on' : ''}>
              <label className="cab">
                <input type="checkbox" checked={l.incluir && !travado} disabled={travado} onChange={(e) => muda(t.id, 'incluir', e.target.checked)} />
                <b>{t.nome}</b><span className="mudo">{fmtN(Number(t.area_ha), 1)} ha</span>
                {travado && <small>Em campo no app: os números vêm das operações</small>}
              </label>
              {!travado && (
                <div className="campos">
                  {familia === 'Safrinha' && (
                    <Rotulo t="Cultura"><select value={l.cultura} onChange={(e) => muda(t.id, 'cultura', e.target.value)}><option>Milho</option><option>Sorgo</option></select></Rotulo>
                  )}
                  <Rotulo t={`Produtividade (${unid}/ha)`}><input inputMode="decimal" value={l.prod} onChange={(e) => muda(t.id, 'prod', e.target.value)} /></Rotulo>
                  <Rotulo t="Área plantada (ha)"><input inputMode="decimal" value={l.area} placeholder={fmtN(Number(t.area_ha), 2)} onChange={(e) => muda(t.id, 'area', e.target.value)} /></Rotulo>
                  <Rotulo t="Insumos (R$/ha)"><input inputMode="decimal" value={l.custo} onChange={(e) => muda(t.id, 'custo', e.target.value)} /></Rotulo>
                  <Rotulo t={cana ? 'Variedade' : 'Cultivar'}><input value={l.cultivar} onChange={(e) => muda(t.id, 'cultivar', e.target.value)} /></Rotulo>
                  {cana && <Rotulo t="ATR (kg/t)"><input inputMode="decimal" value={l.atr} onChange={(e) => muda(t.id, 'atr', e.target.value)} /></Rotulo>}
                  {cana && <Rotulo t="Corte nº"><input inputMode="numeric" value={l.corte} onChange={(e) => muda(t.id, 'corte', e.target.value)} /></Rotulo>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button className="primario fixo" disabled={salvando || !escolhidos.length}>
        {salvando ? 'Salvando…' : escolhidos.length ? `Salvar ${grupo} (${escolhidos.length} talhões)` : 'Marque ao menos um talhão'}
      </button>
    </form>
  )
}
