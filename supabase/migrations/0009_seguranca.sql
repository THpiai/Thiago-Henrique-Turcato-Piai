-- Segurança (09/10/2026, pedido do Thiago): só entra quem foi convidado, o banco recusa
-- valores absurdos mesmo que alguém fuja do app, limite de ritmo contra abuso, autor do
-- registro não muda de dono e a função do clima só aceita o agendador.

-- ── 1. Cadastro só por convite ──────────────────────────────────────────
-- Sem convite, a conta nem é criada (e nenhum e-mail de confirmação sai).
-- Corta cadastro em massa por robô e uso do app para disparar e-mails.
create function privado.so_convidado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from convites where email = lower(new.email)) then
    raise exception 'Cadastro só por convite' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function privado.so_convidado() from public, anon, authenticated;
create trigger so_convidado before insert on auth.users
  for each row execute function privado.so_convidado();

alter table public.convites
  add constraint convites_email_valido check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  add constraint convites_nome_tamanho check (length(nome) between 1 and 80);

-- ── 2. Validação no banco (a mesma regra do app, em src/lib/validar.ts) ──
alter table public.pessoas
  add constraint pessoas_nome_tamanho check (length(nome) between 1 and 80);

alter table public.talhoes
  add constraint talhoes_nome_tamanho check (length(nome) between 1 and 80),
  add constraint talhoes_area_max     check (area_ha <= 5000),
  add constraint talhoes_obs_tamanho  check (length(observacao) <= 2000);

alter table public.insumos
  add constraint insumos_nome_tamanho check (length(nome) between 1 and 120),
  add constraint insumos_numeros      check (coalesce(estoque_minimo, 0) >= 0 and coalesce(preco_unitario, 0) >= 0
                                             and coalesce(dose_ha_padrao, 0) >= 0),
  add constraint insumos_textos       check (length(fabricante) <= 120 and length(ingrediente_ativo) <= 200 and length(classe) <= 80);

alter table public.ciclos
  add constraint ciclos_numeros check (
        coalesce(producao, 0) >= 0 and coalesce(meta_por_ha, 0) >= 0
    and coalesce(populacao_plantas_ha, 0) between 0 and 5000000
    and coalesce(ciclo_cultivar_dias, 0) between 0 and 2000
    and coalesce(corte_cana, 0) between 0 and 30
    and coalesce(atr_kg_t, 0) between 0 and 300),
  add constraint ciclos_textos check (length(safra) <= 40 and length(cultivar) <= 80 and length(observacao) <= 2000);

alter table public.operacoes
  add constraint operacoes_numeros check (
        coalesce(area_ha, 1) > 0 and coalesce(area_ha, 0) <= 5000
    and coalesce(horas, 0) between 0 and 1000
    and coalesce(volume_calda_l_ha, 0) between 0 and 1000
    and coalesce(temperatura_c, 20) between -10 and 60
    and coalesce(umidade_pct, 50) between 0 and 100
    and coalesce(vento_kmh, 0) between 0 and 150
    and coalesce(populacao_plantas_ha, 0) between 0 and 5000000
    and coalesce(producao, 0) >= 0
    and coalesce(latitude, 0) between -90 and 90 and coalesce(longitude, 0) between -180 and 180),
  add constraint operacoes_textos check (length(alvo) <= 200 and length(receituario) <= 200
    and length(observacao) <= 2000 and length(cultivar) <= 80);

alter table public.operacao_produtos
  add constraint produtos_dose_max check (dose_ha <= 100000);

alter table public.campo
  add constraint campo_numeros check (coalesce(nivel_encontrado, 0) >= 0 and coalesce(nivel_de_controle, 0) >= 0
    and coalesce(latitude, 0) between -90 and 90 and coalesce(longitude, 0) between -180 and 180),
  add constraint campo_textos check (length(alvo) <= 200 and length(descricao) <= 2000 and length(unidade_nivel) <= 40);

alter table public.chuva
  add constraint chuva_mm_faixa check (milimetros between 0 and 400),
  add constraint chuva_obs_tamanho check (length(observacao) <= 500);

alter table public.estoque_mov
  add constraint estoque_numeros check (quantidade > 0 and quantidade <= 10000000 and coalesce(valor_total, 0) >= 0),
  add constraint estoque_textos check (length(nota_fiscal) <= 60 and length(fornecedor) <= 120 and length(observacao) <= 2000);

alter table public.estadios
  add constraint estadios_tamanho check (length(estadio) between 1 and 40);

-- Datas: nada antes de 2015 nem mais de 2 dias no futuro (folga para relógio de celular errado).
create function privado.data_plausivel() returns trigger
language plpgsql set search_path = '' as $$
declare d timestamptz := coalesce((to_jsonb(new) ->> 'data_hora')::timestamptz, (to_jsonb(new) ->> 'data')::date::timestamptz);
begin
  if d < '2015-01-01' or d > now() + interval '2 days' then
    raise exception 'Data fora do esperado: %', d::date using errcode = '22008';
  end if;
  return new;
end $$;
revoke all on function privado.data_plausivel() from public, anon, authenticated;

-- ── 3. Autor do registro não troca de dono (só dono/encarregado corrigem) ─
create function privado.autor_fixo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.autor_id is distinct from old.autor_id and auth.uid() is not null and not privado.eh_gestor() then
    raise exception 'O autor do registro não pode ser trocado' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function privado.autor_fixo() from public, anon, authenticated;

-- ── 4. Limite de ritmo contra abuso ──────────────────────────────────────
-- Até 600 registros novos por pessoa, por tabela, por hora. Uso normal fica muito abaixo,
-- mesmo descarregando dias sem sinal de uma vez (upsert de registro já enviado não conta).
-- Se estourar, o app guarda na fila e tenta de novo depois, sem perder nada.
create function privado.limita_ritmo() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;  -- função agendada (clima) não entra no limite
  execute format('select count(*) from public.%I where autor_id = $1 and created_at > now() - interval ''1 hour''', tg_table_name)
    into n using auth.uid();
  if n >= 600 then
    raise exception 'Muitos registros em pouco tempo. Tente de novo mais tarde.' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function privado.limita_ritmo() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['operacoes','campo','estoque_mov','chuva','estadios'] loop
    execute format('create index if not exists %I on public.%I (autor_id, created_at)', t || '_autor_criado', t);
    execute format('create trigger limita_ritmo before insert on public.%I for each row execute function privado.limita_ritmo()', t);
    execute format('create trigger autor_fixo before update on public.%I for each row execute function privado.autor_fixo()', t);
    execute format('create trigger data_plausivel before insert or update on public.%I for each row execute function privado.data_plausivel()', t);
  end loop;
end $$;

-- ── 5. Função do clima só aceita o agendador ────────────────────────────
-- A chave anon é pública; antes, qualquer um podia disparar a função. Agora o agendador
-- manda um código guardado no cofre (vault) e a função confere antes de rodar.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'clima_token', 'Código do agendador para a função clima');

create function public.clima_token_confere(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'clima_token' and decrypted_secret = t)
$$;
revoke all on function public.clima_token_confere(text) from public, anon, authenticated;
grant execute on function public.clima_token_confere(text) to service_role;

select cron.unschedule('clima-open-meteo');
select cron.schedule('clima-open-meteo', '0 9,21 * * *', $$
  select net.http_post(
    url := 'https://wdsaiwehttuvduhdflwv.supabase.co/functions/v1/clima',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkc2Fpd2VodHR1dmR1aGRmbHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMjg1MDcsImV4cCI6MjEwNjkwNDUwN30.8j9c7oJ29-Wv8k5Ba2v7LXCl6S46Hif0UPbFlBY-4Bo',
      'x-clima-token', (select decrypted_secret from vault.decrypted_secrets where name = 'clima_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
$$);

-- A função agendada do clima (service_role) passa pelos gatilhos novos.
grant usage on schema privado to service_role;
grant execute on function privado.data_plausivel(), privado.autor_fixo(), privado.limita_ritmo(), privado.eh_gestor() to service_role;
