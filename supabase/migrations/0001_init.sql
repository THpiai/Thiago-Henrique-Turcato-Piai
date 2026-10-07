-- Flor da Mata · banco do app (v1)
-- Espelha a planilha v2. IDs são uuid gerados no celular, para o registro
-- feito sem sinal subir depois sem duplicar (upsert pelo id).

create extension if not exists pgcrypto;

-- ── Pessoas e permissões ────────────────────────────────────────────────
create table public.pessoas (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null unique,
  perfil      text not null default 'operador' check (perfil in ('dono','encarregado','operador')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create function public.eh_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pessoas where id = auth.uid() and ativo)
$$;

create function public.eh_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pessoas where id = auth.uid() and ativo and perfil = 'dono')
$$;

create function public.eh_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pessoas where id = auth.uid() and ativo and perfil in ('dono','encarregado'))
$$;

-- ── Cadastros ───────────────────────────────────────────────────────────
create table public.talhoes (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  area_ha      numeric(10,2) not null check (area_ha > 0),
  contorno     jsonb,                       -- polígono GeoJSON desenhado no app
  latitude     numeric(9,6),                -- centro, calculado do contorno
  longitude    numeric(9,6),
  pluviometro  boolean not null default false,
  ativo        boolean not null default true,
  observacao   text,
  created_at   timestamptz not null default now()
);

create table public.insumos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  tipo            text not null check (tipo in ('Semente','Fertilizante','Corretivo','Defensivo','Combustível','Peça','Outro')),
  unidade         text not null check (unidade in ('kg','t','L','mL','g','sc','un','ha','h')),
  estoque_minimo  numeric(12,2),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Um ciclo = um talhão numa safra com uma cultura.
create table public.ciclos (
  id                    uuid primary key default gen_random_uuid(),
  talhao_id             uuid not null references talhoes(id),
  safra                 text not null,                -- ex.: Safra 2026/27, Safrinha 2027, Cana 2026/27
  cultura               text not null check (cultura in ('Soja','Milho','Sorgo','Cana-de-açúcar','Pousio')),
  cultivar              text,
  ciclo_cultivar_dias   int,
  data_plantio          date,
  populacao_plantas_ha  int,
  estadio_atual         text,
  data_estadio          date,
  colheita_prevista     date,
  data_colheita         date,
  producao              numeric(12,2),
  unidade_producao      text check (unidade_producao in ('sc','t')),
  meta_por_ha           numeric(10,2),
  corte_cana            int,
  atr_kg_t              numeric(8,2),
  status                text not null default 'Planejado' check (status in ('Planejado','Em andamento','Colhido')),
  observacao            text,
  created_at            timestamptz not null default now()
);
create index on ciclos (talhao_id, status);

-- ── Registros de campo (os 3 botões) ────────────────────────────────────
create table public.operacoes (
  id                 uuid primary key,             -- gerado no celular
  data_hora          timestamptz not null,
  autor_id           uuid not null default auth.uid() references pessoas(id),
  talhao_id          uuid not null references talhoes(id),
  ciclo_id           uuid references ciclos(id),
  tipo               text not null check (tipo in ('Preparo de solo','Calagem e gessagem','Plantio','Adubação','Pulverização','Colheita','Corte de cana','Manutenção','Outra')),
  area_ha            numeric(10,2),
  horas              numeric(6,2),
  alvo               text,
  volume_calda_l_ha  numeric(8,2),
  temperatura_c      numeric(5,1),
  umidade_pct        numeric(5,1),
  vento_kmh          numeric(5,1),
  receituario        text,
  foto_path          text,
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  observacao         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on operacoes (talhao_id, data_hora desc);

create table public.operacao_produtos (
  id                uuid primary key,
  operacao_id       uuid not null references operacoes(id) on delete cascade,
  insumo_id         uuid not null references insumos(id),
  dose_ha           numeric(12,4) not null check (dose_ha > 0),
  unidade           text not null,
  quantidade_total  numeric(14,4),               -- preenchida pelo gatilho: dose × área
  created_at        timestamptz not null default now()
);
create index on operacao_produtos (insumo_id);
create index on operacao_produtos (operacao_id);

create table public.campo (
  id                 uuid primary key,
  data_hora          timestamptz not null,
  autor_id           uuid not null default auth.uid() references pessoas(id),
  talhao_id          uuid not null references talhoes(id),
  ciclo_id           uuid references ciclos(id),
  tipo               text not null check (tipo in ('Praga','Doença','Planta daninha','Falha de estande','Máquina','Infraestrutura','Outro')),
  alvo               text,
  nivel_encontrado   numeric(10,2),
  unidade_nivel      text,
  nivel_de_controle  numeric(10,2),
  urgencia           text check (urgencia in ('Baixa','Média','Alta')),
  status             text not null default 'Aberta' check (status in ('Aberta','Monitorando','Aplicação indicada','Resolvida')),
  foto_path          text,
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  descricao          text,
  resolvido_em       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on campo (talhao_id, data_hora desc);

create table public.estoque_mov (
  id             uuid primary key,
  data           date not null default current_date,
  autor_id       uuid not null default auth.uid() references pessoas(id),
  insumo_id      uuid not null references insumos(id),
  movimento      text not null check (movimento in ('Entrada','Saída avulsa','Ajuste de inventário')),
  quantidade     numeric(14,4) not null,          -- ajuste pode ser negativo
  valor_total    numeric(14,2),
  nota_fiscal    text,
  fornecedor     text,
  observacao     text,
  created_at     timestamptz not null default now()
);
create index on estoque_mov (insumo_id);

create table public.chuva (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  talhao_id   uuid references talhoes(id),          -- nulo = estimativa da fazenda inteira
  milimetros  numeric(6,1) not null check (milimetros >= 0),
  fonte       text not null check (fonte in ('Pluviômetro','Estimativa automática')),
  autor_id    uuid references pessoas(id),
  observacao  text,
  created_at  timestamptz not null default now()
);
create unique index chuva_estimativa_unica on chuva (data) where fonte = 'Estimativa automática';
create index on chuva (talhao_id, data desc);

create table public.clima_horario (
  hora           timestamptz primary key,
  temperatura_c  numeric(5,1),
  umidade_pct    numeric(5,1),
  vento_kmh      numeric(5,1)
);

create table public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  responsavel_id uuid references pessoas(id),
  talhao_id      uuid references talhoes(id),
  prazo          date,
  status         text not null default 'A fazer' check (status in ('A fazer','Fazendo','Feita')),
  concluida_em   timestamptz,
  criada_por     uuid default auth.uid() references pessoas(id),
  created_at     timestamptz not null default now()
);

create table public.solo_analises (
  id               uuid primary key default gen_random_uuid(),
  talhao_id        uuid not null references talhoes(id),
  data_coleta      date not null,
  profundidade_cm  text not null,                  -- 0-20, 20-40
  ph_cacl2         numeric(4,2),
  mo_g_dm3         numeric(6,2),
  p_mg_dm3         numeric(6,2),
  k_mmolc_dm3      numeric(6,2),
  ca_mmolc_dm3     numeric(6,2),
  mg_mmolc_dm3     numeric(6,2),
  v_pct            numeric(5,1),
  laboratorio      text,
  observacao       text,
  created_at       timestamptz not null default now()
);

-- ── Regras automáticas ──────────────────────────────────────────────────
-- Quantidade usada = dose/ha × área da operação (vira baixa de estoque).
create function public.calc_quantidade_total() returns trigger
language plpgsql set search_path = public as $$
begin
  new.quantidade_total := new.dose_ha * coalesce((select area_ha from operacoes where id = new.operacao_id), 0);
  return new;
end $$;
create trigger operacao_produtos_quantidade before insert or update of dose_ha, operacao_id
  on operacao_produtos for each row execute function calc_quantidade_total();

-- Se a área da operação mudar, recalcula os produtos dela.
create function public.recalc_produtos_da_operacao() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.area_ha is distinct from old.area_ha then
    update operacao_produtos set quantidade_total = dose_ha * coalesce(new.area_ha, 0) where operacao_id = new.id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger operacoes_area before update on operacoes
  for each row execute function recalc_produtos_da_operacao();

-- Ciclo ativo do talhão é preenchido sozinho quando não vem do celular.
create function public.preenche_ciclo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ciclo_id is null then
    select id into new.ciclo_id from ciclos
     where talhao_id = new.talhao_id and status = 'Em andamento'
     order by data_plantio desc nulls last limit 1;
  end if;
  return new;
end $$;
create trigger operacoes_ciclo before insert on operacoes for each row execute function preenche_ciclo();
create trigger campo_ciclo before insert on campo for each row execute function preenche_ciclo();

-- Monitoramento acima do nível de controle vira "Aplicação indicada".
create function public.status_mip() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tipo in ('Praga','Doença','Planta daninha') and new.status in ('Aberta','Monitorando')
     and new.nivel_encontrado is not null and new.nivel_de_controle is not null then
    new.status := case when new.nivel_encontrado >= new.nivel_de_controle then 'Aplicação indicada' else 'Monitorando' end;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger campo_mip before insert or update on campo for each row execute function status_mip();

-- ── Visões para o painel ────────────────────────────────────────────────
create view public.v_estoque with (security_invoker = true) as
select i.id as insumo_id, i.nome, i.unidade, i.estoque_minimo,
       coalesce(e.entradas,0)  as entradas,
       coalesce(u.usado,0)     as uso_operacoes,
       coalesce(e.avulsas,0)   as saidas_avulsas,
       coalesce(e.ajustes,0)   as ajustes,
       coalesce(e.entradas,0) - coalesce(u.usado,0) - coalesce(e.avulsas,0) + coalesce(e.ajustes,0) as saldo,
       case when coalesce(e.qtd_valor,0) > 0 then e.valor / e.qtd_valor end as custo_medio
  from insumos i
  left join (select insumo_id,
                    sum(quantidade) filter (where movimento = 'Entrada')              as entradas,
                    sum(quantidade) filter (where movimento = 'Saída avulsa')         as avulsas,
                    sum(quantidade) filter (where movimento = 'Ajuste de inventário') as ajustes,
                    sum(valor_total) filter (where movimento = 'Entrada' and valor_total is not null) as valor,
                    sum(quantidade)  filter (where movimento = 'Entrada' and valor_total is not null) as qtd_valor
               from estoque_mov group by insumo_id) e on e.insumo_id = i.id
  left join (select insumo_id, sum(quantidade_total) as usado from operacao_produtos group by insumo_id) u on u.insumo_id = i.id;

-- Custo de insumos por ciclo e por hectare (preço médio de entrada).
create view public.v_custo_ciclo with (security_invoker = true) as
select c.id as ciclo_id, c.talhao_id, c.safra, c.cultura, t.area_ha,
       sum(op.quantidade_total * ve.custo_medio)                 as custo_insumos,
       sum(op.quantidade_total * ve.custo_medio) / nullif(t.area_ha,0) as custo_por_ha
  from ciclos c
  join talhoes t on t.id = c.talhao_id
  left join operacoes o on o.ciclo_id = c.id
  left join operacao_produtos op on op.operacao_id = o.id
  left join v_estoque ve on ve.insumo_id = op.insumo_id
 group by c.id, c.talhao_id, c.safra, c.cultura, t.area_ha;

-- ── Segurança (RLS) ─────────────────────────────────────────────────────
-- Todo membro ativo lê tudo. Registros de campo: cada um grava como ele mesmo
-- e corrige o próprio registro; dono e encarregado corrigem qualquer um.
-- Cadastros: só dono e encarregado alteram.
do $$
declare t text;
begin
  foreach t in array array['pessoas','talhoes','insumos','ciclos','operacoes','operacao_produtos','campo',
                           'estoque_mov','chuva','clima_horario','tarefas','solo_analises'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy membro_le on public.%I for select to authenticated using (eh_membro())', t);
  end loop;
  foreach t in array array['talhoes','insumos','ciclos','solo_analises'] loop
    execute format('create policy gestor_insere on public.%I for insert to authenticated with check (eh_gestor())', t);
    execute format('create policy gestor_altera on public.%I for update to authenticated using (eh_gestor()) with check (eh_gestor())', t);
    execute format('create policy gestor_apaga on public.%I for delete to authenticated using (eh_gestor())', t);
  end loop;
  foreach t in array array['operacoes','campo','estoque_mov'] loop
    execute format('create policy membro_insere on public.%I for insert to authenticated with check (eh_membro() and autor_id = auth.uid())', t);
    execute format('create policy autor_ou_gestor_altera on public.%I for update to authenticated using (autor_id = auth.uid() or eh_gestor()) with check (eh_membro())', t);
    execute format('create policy gestor_apaga on public.%I for delete to authenticated using (eh_gestor())', t);
  end loop;
end $$;

create policy produtos_insere on public.operacao_produtos for insert to authenticated
  with check (exists (select 1 from operacoes o where o.id = operacao_id and (o.autor_id = auth.uid() or eh_gestor())));
create policy produtos_altera on public.operacao_produtos for update to authenticated
  using (exists (select 1 from operacoes o where o.id = operacao_id and (o.autor_id = auth.uid() or eh_gestor())));
create policy produtos_apaga on public.operacao_produtos for delete to authenticated
  using (exists (select 1 from operacoes o where o.id = operacao_id and (o.autor_id = auth.uid() or eh_gestor())));

create policy chuva_insere on public.chuva for insert to authenticated
  with check (eh_membro() and fonte = 'Pluviômetro' and autor_id = auth.uid());
create policy chuva_gestor on public.chuva for update to authenticated using (eh_gestor());

create policy tarefas_membro on public.tarefas for insert to authenticated with check (eh_membro());
create policy tarefas_altera on public.tarefas for update to authenticated
  using (eh_gestor() or responsavel_id = auth.uid());

create policy pessoas_dono_insere on public.pessoas for insert to authenticated with check (eh_dono());
create policy pessoas_dono_altera on public.pessoas for update to authenticated using (eh_dono()) with check (eh_dono());
create policy pessoas_dono_apaga on public.pessoas for delete to authenticated using (eh_dono());
-- Estimativas de clima são gravadas pela função agendada (service role, ignora RLS).
