-- Duas sedes (Carlim e Flor da Mata) e clima automático do Open-Meteo para cada uma.
create table public.sedes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  latitude   numeric(9,6) not null,
  longitude  numeric(9,6) not null,
  created_at timestamptz not null default now()
);
alter table public.sedes enable row level security;
create policy membro_le on public.sedes for select to authenticated using (privado.eh_membro());
create policy gestor_insere on public.sedes for insert to authenticated with check (privado.eh_gestor());
create policy gestor_altera on public.sedes for update to authenticated using (privado.eh_gestor()) with check (privado.eh_gestor());
create policy gestor_apaga on public.sedes for delete to authenticated using (privado.eh_gestor());

insert into public.sedes (nome, latitude, longitude) values
  ('Flor da Mata', -19.831513, -48.855723),
  ('Carlim',       -19.984539, -48.802805);

-- Estimativa de chuva é por sede; o talhão usa a sede mais próxima.
alter table public.chuva add column sede_id uuid references public.sedes(id);
create unique index chuva_estimativa_dia on public.chuva (sede_id, data) where fonte = 'Estimativa automática';
create index chuva_talhao_data on public.chuva (talhao_id, data);

-- Clima horário passa a ser por sede.
alter table public.clima_horario add column sede_id uuid references public.sedes(id);
alter table public.clima_horario drop constraint clima_horario_pkey;
alter table public.clima_horario alter column sede_id set not null;
alter table public.clima_horario add primary key (sede_id, hora);
alter table public.clima_horario add column chuva_mm numeric(6,1);

-- Chave anon é pública (a mesma que vai no app); só serve para a função aceitar a chamada.
-- Busca o clima duas vezes por dia (6h e 18h de Brasília) pela função "clima".
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('clima-open-meteo', '0 9,21 * * *', $$
  select net.http_post(
    url := 'https://wdsaiwehttuvduhdflwv.supabase.co/functions/v1/clima',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkc2Fpd2VodHR1dmR1aGRmbHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMjg1MDcsImV4cCI6MjEwNjkwNDUwN30.8j9c7oJ29-Wv8k5Ba2v7LXCl6S46Hif0UPbFlBY-4Bo'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
$$);
