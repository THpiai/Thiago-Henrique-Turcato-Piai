-- Safra automática: a operação registrada no talhão alimenta a safra sozinha.
-- Plantio abre (ou cria) a safra; Colheita / Corte de cana somam a produção e fecham a safra
-- quando a área colhida chega a 95% do talhão. Vale para qualquer pessoa da equipe.
alter table public.operacoes
  add column cultura              text check (cultura in ('Soja','Milho','Sorgo','Cana-de-açúcar','Pousio')),
  add column cultivar             text,
  add column populacao_plantas_ha int,
  add column producao             numeric(12,2),
  add column unidade_producao     text check (unidade_producao in ('sc','t'));

-- Dados comerciais do insumo (o "padrão mercado" aparece no app quando estes ficam vazios).
alter table public.insumos
  add column fabricante        text,
  add column ingrediente_ativo text,
  add column classe            text,
  add column dose_ha_padrao    numeric(12,4),
  add column preco_unitario    numeric(12,2);

-- Nome da safra pela cultura e data: Safra 2026/27, Safrinha 2027, Cana 2026/27.
create function privado.nome_safra(cultura text, d date) returns text
language sql immutable set search_path = '' as $$
  select case
    when cultura = 'Cana-de-açúcar' then
      'Cana ' || (case when extract(month from d) >= 4 then extract(year from d) else extract(year from d) - 1 end)::int
      || '/' || right(((case when extract(month from d) >= 4 then extract(year from d) else extract(year from d) - 1 end) + 1)::int::text, 2)
    when cultura in ('Milho','Sorgo') and extract(month from d) between 1 and 6 then 'Safrinha ' || extract(year from d)::int
    else
      'Safra ' || (case when extract(month from d) >= 7 then extract(year from d) else extract(year from d) - 1 end)::int
      || '/' || right(((case when extract(month from d) >= 7 then extract(year from d) else extract(year from d) - 1 end) + 1)::int::text, 2)
  end
$$;

-- Antes de gravar a operação: liga à safra aberta do talhão; no Plantio sem safra, cria a safra.
create function public.operacao_ciclo() returns trigger
language plpgsql security definer set search_path = public as $$
declare dia date := (new.data_hora at time zone 'America/Sao_Paulo')::date;
begin
  if new.ciclo_id is not null and not exists (select 1 from ciclos where id = new.ciclo_id) then
    if new.tipo = 'Plantio' and new.cultura is not null then
      insert into ciclos (id, talhao_id, safra, cultura, cultivar, populacao_plantas_ha, data_plantio, status)
      values (new.ciclo_id, new.talhao_id, privado.nome_safra(new.cultura, dia), new.cultura, new.cultivar,
              new.populacao_plantas_ha, dia, 'Em andamento');
    else
      new.ciclo_id := null;
    end if;
  end if;
  if new.ciclo_id is null then
    select id into new.ciclo_id from ciclos
     where talhao_id = new.talhao_id and status in ('Em andamento','Planejado') and excluido_em is null
     order by (status = 'Em andamento') desc, data_plantio desc nulls last limit 1;
  end if;
  if new.ciclo_id is null and new.tipo = 'Plantio' and new.cultura is not null then
    new.ciclo_id := gen_random_uuid();
    insert into ciclos (id, talhao_id, safra, cultura, cultivar, populacao_plantas_ha, data_plantio, status)
    values (new.ciclo_id, new.talhao_id, privado.nome_safra(new.cultura, dia), new.cultura, new.cultivar,
            new.populacao_plantas_ha, dia, 'Em andamento');
  end if;
  return new;
end $$;
create or replace trigger operacoes_ciclo before insert on public.operacoes for each row execute function public.operacao_ciclo();

-- Recalcula a safra a partir das operações dela (plantio, colheita, produção).
create function privado.recalcula_ciclo(c uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p record; h record; area numeric;
begin
  if c is null then return; end if;
  select t.area_ha into area from ciclos ci join talhoes t on t.id = ci.talhao_id where ci.id = c;
  select min((data_hora at time zone 'America/Sao_Paulo')::date) as dia,
         (array_agg(cultivar order by data_hora) filter (where cultivar is not null))[1] as cultivar,
         (array_agg(populacao_plantas_ha order by data_hora) filter (where populacao_plantas_ha is not null))[1] as pop
    into p from operacoes
   where ciclo_id = c and tipo = 'Plantio' and excluido_em is null;
  select sum(area_ha) as area, sum(producao) as prod, max(unidade_producao) as un,
         max((data_hora at time zone 'America/Sao_Paulo')::date) as dia
    into h from operacoes
   where ciclo_id = c and tipo in ('Colheita','Corte de cana') and excluido_em is null;
  update ciclos set
    data_plantio         = coalesce(p.dia, data_plantio),
    cultivar             = coalesce(cultivar, p.cultivar),
    populacao_plantas_ha = coalesce(populacao_plantas_ha, p.pop),
    producao             = coalesce(h.prod, producao),
    unidade_producao     = case when h.prod is not null then coalesce(h.un, unidade_producao, case when cultura = 'Cana-de-açúcar' then 't' else 'sc' end) else unidade_producao end,
    data_colheita        = case when h.area >= 0.95 * area then h.dia else data_colheita end,
    status               = case when h.area >= 0.95 * area then 'Colhido'
                                when status = 'Planejado' and p.dia is not null then 'Em andamento'
                                else status end
   where id = c;
end $$;

create function public.operacao_recalcula() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform privado.recalcula_ciclo(new.ciclo_id);
  if tg_op = 'UPDATE' and old.ciclo_id is distinct from new.ciclo_id then
    perform privado.recalcula_ciclo(old.ciclo_id);
  end if;
  return null;
end $$;
create trigger operacoes_recalcula after insert or update on public.operacoes
  for each row execute function public.operacao_recalcula();

-- Funções de gatilho não ficam chamáveis pela API.
revoke execute on function public.operacao_ciclo(), public.operacao_recalcula() from public, anon, authenticated;
revoke execute on function privado.recalcula_ciclo(uuid), privado.nome_safra(text, date) from public, anon, authenticated;
