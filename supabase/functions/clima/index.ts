// Busca chuva diária e clima horário no Open-Meteo para cada sede e grava no banco.
// Chamada pelo agendador (pg_cron) duas vezes por dia. Idempotente: pode rodar quantas vezes quiser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Id fixo por sede e dia, para regravar o mesmo registro em vez de duplicar.
async function idFixo(texto: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto))).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80
  const x = [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

Deno.serve(async () => {
  const { data: sedes, error } = await db.from('sedes').select('id,nome,latitude,longitude')
  if (error) return Response.json({ erro: error.message }, { status: 500 })
  const { count } = await db.from('chuva').select('id', { count: 'exact', head: true }).eq('fonte', 'Estimativa automática')
  const diasPassados = count ? 7 : 92 // primeira vez busca o histórico de 3 meses
  const resumo: Record<string, unknown> = {}

  for (const s of sedes ?? []) {
    const u = new URL('https://api.open-meteo.com/v1/forecast')
    u.search = new URLSearchParams({
      latitude: String(s.latitude), longitude: String(s.longitude), timezone: 'America/Sao_Paulo',
      past_days: String(diasPassados), forecast_days: '7', wind_speed_unit: 'kmh',
      daily: 'precipitation_sum',
      hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation',
    }).toString()
    const r = await fetch(u)
    if (!r.ok) { resumo[s.nome] = `Open-Meteo ${r.status}`; continue }
    const j = await r.json()
    const off = j.utc_offset_seconds as number
    const sinal = off < 0 ? '-' : '+', a = Math.abs(off)
    const fuso = `${sinal}${String(Math.floor(a / 3600)).padStart(2, '0')}:${String((a % 3600) / 60).padStart(2, '0')}`
    const hoje = new Date(Date.now() + off * 1000).toISOString().slice(0, 10)

    const chuva = []
    for (let i = 0; i < j.daily.time.length; i++) {
      const data = j.daily.time[i] as string
      const mm = j.daily.precipitation_sum[i]
      if (data > hoje || mm == null) continue // só dias que já aconteceram
      chuva.push({ id: await idFixo(`chuva:${s.id}:${data}`), data, sede_id: s.id, milimetros: mm, fonte: 'Estimativa automática', observacao: 'Open-Meteo' })
    }
    const horas = (j.hourly.time as string[]).map((t, i) => ({
      sede_id: s.id, hora: `${t}:00${fuso}`, temperatura_c: j.hourly.temperature_2m[i],
      umidade_pct: j.hourly.relative_humidity_2m[i], vento_kmh: j.hourly.wind_speed_10m[i], chuva_mm: j.hourly.precipitation[i],
    }))
    const e1 = (await db.from('chuva').upsert(chuva, { onConflict: 'id' })).error
    const e2 = (await db.from('clima_horario').upsert(horas, { onConflict: 'sede_id,hora' })).error
    resumo[s.nome] = e1 || e2 ? (e1 ?? e2)!.message : { dias: chuva.length, horas: horas.length }
  }
  // Clima horário antigo não é usado: guarda 30 dias.
  await db.from('clima_horario').delete().lt('hora', new Date(Date.now() - 30 * 864e5).toISOString())
  return Response.json(resumo)
})
