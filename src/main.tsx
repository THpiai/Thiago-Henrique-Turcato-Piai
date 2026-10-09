import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ErroValidacao } from './lib/validar'
import './styles.css'

// O GitHub Pages não deixa mandar o cabeçalho que proíbe abrir o app dentro de outro site
// (frame-ancestors); então o próprio app se recusa a rodar escondido num quadro.
if (window.top !== window.self) {
  document.documentElement.innerHTML = ''
  throw new Error('Flor da Mata não abre dentro de outro site.')
}
// Formulário recusado pela validação já mostra o motivo na tela (BarraErro).
window.addEventListener('unhandledrejection', (e) => { if (e.reason instanceof ErroValidacao) e.preventDefault() })

registerSW({ immediate: true })
// Pede ao navegador para não apagar os registros guardados no celular quando faltar espaço.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
