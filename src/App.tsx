import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { db, gravarMeta, lerMeta } from './lib/db'
import { iniciarSync, receber } from './lib/sync'
import { SessaoCtx, useSessao, type Sessao } from './lib/hooks'
import { Icone } from './components/Icone'
import type { Pessoa } from './lib/tipos'
import { BarraSync } from './components/ui'
import { AguardandoLiberacao, Login } from './screens/Login'
import { Inicio } from './screens/Inicio'
import { TalhaoDetalhe } from './screens/Talhao'
import { Registrar } from './screens/Registrar'
import { FormOperacao } from './screens/FormOperacao'
import { FormCampo } from './screens/FormCampo'
import { FormChuva } from './screens/FormChuva'
import { Estoque } from './screens/Estoque'
import { Mapa } from './screens/Mapa'
import { Safra } from './screens/Safra'
import { Equipe, Fila, FormCiclo, Insumos, Lixeira, Mais, Safras } from './screens/Mais'
import { BarraDesfazer, BarraErro } from './components/Apagar'

/** Rota no endereço (#/tela/a/b) para o botão Voltar do celular funcionar. */
function useRota(): [string[], (r: string) => void] {
  const ler = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [r, setR] = useState(ler)
  useEffect(() => {
    const f = () => { setR(ler()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return [r.length ? r : ['inicio'], useCallback((x: string) => { location.hash = '#/' + x }, [])]
}

type Fase = { f: 'carregando' } | { f: 'login' } | { f: 'aguardando'; email: string } | { f: 'dentro'; eu: Pessoa }

export function App() {
  const [fase, setFase] = useState<Fase>({ f: 'carregando' })

  const resolver = useCallback(async (s: Session | null) => {
    const guardado = await lerMeta<Pessoa>('eu')
    if (!s) {
      // Sem sinal e sessão vencida: deixa continuar registrando com o perfil guardado.
      if (guardado && !navigator.onLine) return setFase({ f: 'dentro', eu: guardado })
      return setFase({ f: 'login' })
    }
    if (guardado?.id === s.user.id && !navigator.onLine) return setFase({ f: 'dentro', eu: guardado })
    const { data, error } = await supabase.from('pessoas').select('*').eq('id', s.user.id).maybeSingle()
    if (error) return setFase(guardado?.id === s.user.id ? { f: 'dentro', eu: guardado } : { f: 'login' })
    if (!data || !data.ativo) return setFase({ f: 'aguardando', email: s.user.email ?? '' })
    await gravarMeta('eu', data)
    setFase({ f: 'dentro', eu: data as Pessoa })
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => resolver(data.session))
    const { data } = supabase.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') void resolver(s) })
    return () => data.subscription.unsubscribe()
  }, [resolver])

  const sair = useCallback(async () => {
    if (await db.fila.count()) {
      alert('Ainda há registros guardados no celular. Conecte-se para enviar antes de sair.')
      return
    }
    await supabase.auth.signOut()
    await db.meta.delete('eu')
    setFase({ f: 'login' })
  }, [])

  if (fase.f === 'carregando') return <p className="vazio">Carregando…</p>
  if (fase.f === 'login') return <Login />
  if (fase.f === 'aguardando') return <AguardandoLiberacao email={fase.email} sair={() => void sair()} />
  const sessao: Sessao = {
    eu: fase.eu, gestor: fase.eu.perfil !== 'operador', dono: fase.eu.perfil === 'dono', sair: () => void sair(),
  }
  return <SessaoCtx.Provider value={sessao}><Casca /></SessaoCtx.Provider>
}

function Casca() {
  const [rota, ir] = useRota()
  const { eu, gestor } = useSessao()
  useEffect(() => {
    void receber(supabase)
    return iniciarSync(supabase)
  }, [])
  const voltar = () => history.back()
  const abrirTalhao = useCallback((id: string) => ir('talhao/' + id), [ir])
  const editarCiclo = (t: string, c?: string) => ir(`ciclo/${t}${c ? '/' + c : ''}`)
  const [tela, a, b] = rota

  const conteudo = (() => {
    switch (tela) {
      case 'talhao': return <TalhaoDetalhe id={a} voltar={voltar} editarCiclo={editarCiclo} />
      case 'registrar': return <Registrar ir={ir} />
      case 'operacao': return <FormOperacao pronto={() => ir('inicio')} />
      case 'campo': return <FormCampo pronto={() => ir('inicio')} />
      case 'chuva': return <FormChuva pronto={() => ir('inicio')} />
      case 'estoque': return <Estoque />
      case 'mapa': return <Mapa abrirTalhao={abrirTalhao} />
      case 'safra': return <Safra abrirTalhao={abrirTalhao} ir={ir} />
      case 'mais': return <Mais ir={ir} />
      case 'safras': return <Safras voltar={voltar} abrir={editarCiclo} />
      case 'ciclo': return <FormCiclo key={`${a}/${b}`} talhaoId={a} cicloId={b} pronto={voltar} />
      case 'insumos': return <Insumos voltar={voltar} />
      case 'equipe': return <Equipe voltar={voltar} />
      case 'fila': return <Fila voltar={voltar} />
      case 'lixeira': return <Lixeira voltar={voltar} />
      default: return <Inicio abrirTalhao={abrirTalhao} ir={ir} />
    }
  })()

  const aba = ['registrar', 'operacao', 'campo', 'chuva'].includes(tela) ? 'registrar'
    : ['mais', 'safras', 'ciclo', 'insumos', 'equipe', 'fila', 'lixeira', 'mapa'].includes(tela) ? 'mais'
      : tela === 'talhao' ? 'inicio' : tela
  const abas = [
    { id: 'inicio', t: 'Início', i: 'inicio' }, { id: 'safra', t: 'Safra', i: 'folha' },
    { id: 'registrar', t: 'Registrar', i: 'registrar' }, { id: 'estoque', t: 'Estoque', i: 'estoque' }, { id: 'mais', t: 'Mais', i: 'mais' },
  ]
  // No computador a barra lateral mostra também os cadastros.
  const extras = [
    { id: 'mapa', t: 'Mapa dos talhões', i: 'mapa' },
    ...(gestor ? [{ id: 'safras', t: 'Safras por talhão', i: 'folha' }, { id: 'insumos', t: 'Insumos', i: 'frasco' }] : []),
    { id: 'equipe', t: 'Equipe', i: 'pessoas' }, { id: 'lixeira', t: 'Lixeira', i: 'lixo' }, { id: 'fila', t: 'Envio', i: 'sinal' },
  ]
  return (
    <div className={tela === 'mapa' ? 'app com-mapa' : 'app'}>
      <header className="topo-app">
        <span className="marca-app"><img src="./icon.svg" alt="" width={28} height={28} /><span>Flor da Mata</span></span>
        <BarraSync />
      </header>
      <nav className="abas" aria-label="Principal">
        <span className="marca-lateral"><img src="./icon.svg" alt="" width={34} height={34} /><span><b>Flor da Mata</b><small>Gestão da fazenda</small></span></span>
        {abas.map((x) => (
          <button key={x.id} className={aba === x.id && !(x.id === 'mais' && extras.some((e) => e.id === tela)) ? 'on' : ''} onClick={() => ir(x.id)} aria-current={aba === x.id ? 'page' : undefined}>
            <Icone n={x.i} />{x.t}
          </button>
        ))}
        <div className="secundarias">
          <small>Cadastros</small>
          {extras.map((x) => (
            <button key={x.id} className={tela === x.id || (x.id === 'safras' && tela === 'ciclo') ? 'on' : ''} onClick={() => ir(x.id)}>
              <Icone n={x.i} t={20} />{x.t}
            </button>
          ))}
        </div>
        <div className="rodape-lateral"><BarraSync /><small>{eu.nome} · {eu.perfil}</small></div>
      </nav>
      <main className={tela === 'mapa' ? 'conteudo cheio' : 'conteudo'}>{conteudo}</main>
      <BarraDesfazer />
      <BarraErro />
    </div>
  )
}
