export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
export const fmtN = (n: number | null | undefined, casas = 0) =>
  n == null ? '–' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas })
export const fmtData = (iso?: string | null) =>
  iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '–'
export const fmtDataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–'
export const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
export const agoraLocal = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export const diasDesde = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).getTime()) / 864e5) : null
export const uuid = () => crypto.randomUUID()
