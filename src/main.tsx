import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './styles.css'

registerSW({ immediate: true })
// Pede ao navegador para não apagar os registros guardados no celular quando faltar espaço.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
