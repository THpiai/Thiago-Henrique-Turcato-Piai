import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Aviso, Rotulo } from '../components/ui'

/** Mensagens do servidor em português, sem expor detalhe técnico. */
function traduzErro(m: string, status?: number) {
  if (/Invalid login/i.test(m)) return 'E-mail ou senha não conferem.'
  if (/saving new user|convite/i.test(m)) return 'Este e-mail ainda não foi convidado. Peça ao Thiago para liberar e tente de novo.'
  if (status === 429 || /rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
  if (/Email not confirmed/i.test(m)) return 'Confirme o e-mail pelo link que enviamos antes de entrar.'
  if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Use "Já tenho conta".'
  if (/password/i.test(m)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
  return 'Não consegui entrar agora. Confira o sinal e tente de novo.'
}

export function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState<{ t: string; tipo: 'info' | 'alerta' | 'ok' } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setOcupado(true); setMsg(null)
    const cred = { email: email.trim().toLowerCase(), password: senha }
    const r = modo === 'entrar' ? await supabase.auth.signInWithPassword(cred) : await supabase.auth.signUp({ ...cred, options: { emailRedirectTo: location.origin + location.pathname } })
    setOcupado(false)
    if (r.error) {
      setMsg({ t: traduzErro(r.error.message, r.error.status), tipo: 'alerta' })
    } else if (modo === 'criar' && !r.data.session) {
      setMsg({ t: 'Conta criada. Abra o e-mail de confirmação e depois volte aqui para entrar.', tipo: 'ok' })
      setModo('entrar')
    }
  }

  return (
    <main className="login">
      <div className="marca">
        <img src="./icon.svg" alt="" width={64} height={64} />
        <h1>Flor da Mata</h1>
        <p>Registro de campo e painel da fazenda</p>
      </div>
      <form onSubmit={enviar} className="cartao">
        <Rotulo t="E-mail"><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></Rotulo>
        <Rotulo t="Senha" dica={modo === 'criar' ? 'Mínimo de 8 caracteres. Use o e-mail em que você foi convidado.' : undefined}>
          <input type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} minLength={8} maxLength={72} required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Rotulo>
        {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}
        <button className="primario" disabled={ocupado}>{modo === 'entrar' ? 'Entrar' : 'Criar minha conta'}</button>
        <button type="button" className="link" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
        </button>
      </form>
    </main>
  )
}

export function AguardandoLiberacao({ email, sair }: { email: string; sair: () => void }) {
  return (
    <main className="login">
      <div className="cartao">
        <h2>Quase lá</h2>
        <p>A conta <b>{email}</b> foi criada, mas ainda não foi liberada para a fazenda.</p>
        <p>Peça ao Thiago para cadastrar este e-mail na equipe. Depois é só abrir o app de novo.</p>
        <button className="secundario" onClick={sair}>Sair</button>
      </div>
    </main>
  )
}
