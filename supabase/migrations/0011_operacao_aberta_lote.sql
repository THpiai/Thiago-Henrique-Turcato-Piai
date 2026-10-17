-- Operação de vários dias, lançada em vários talhões de uma vez, e sobra de outra variedade no plantio.
-- data_hora passa a ser o início. em_andamento = começou e ainda não terminou; data_fim = quando terminou
-- (vazio numa operação concluída = terminou no mesmo dia). lote_id junta as operações salvas juntas
-- (uma por talhão). sobras = outras variedades que entraram no plantio: [{cultivar, sementes, area_ha}].
alter table public.operacoes
  add column em_andamento boolean not null default false,
  add column data_fim     timestamptz,
  add column lote_id      uuid,
  add column sobras       jsonb;

create index operacoes_lote on public.operacoes (lote_id) where lote_id is not null;
create index operacoes_abertas on public.operacoes (talhao_id) where em_andamento;

alter table public.operacoes
  add constraint operacoes_fim check (data_fim is null or data_fim >= data_hora),
  add constraint operacoes_aberta_sem_fim check (not (em_andamento and data_fim is not null)),
  add constraint operacoes_sobras check (sobras is null or (
        jsonb_typeof(sobras) = 'array' and jsonb_array_length(sobras) <= 5 and length(sobras::text) <= 1000));

-- Fim não pode ficar no futuro (mesma folga de 2 dias das outras datas).
create function privado.fim_plausivel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.data_fim is not null and new.data_fim > now() + interval '2 days' then
    raise exception 'Data de término no futuro: %', new.data_fim::date using errcode = '22008';
  end if;
  return new;
end $$;
revoke all on function privado.fim_plausivel() from public, anon, authenticated;
create trigger fim_plausivel before insert or update on public.operacoes
  for each row execute function privado.fim_plausivel();

-- Colheita ainda em andamento não fecha a safra; ela fecha quando a colheita termina.
create or replace function privado.recalcula_ciclo(c uuid) returns void
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
  select sum(area_ha) filter (where not em_andamento) as area, sum(producao) as prod, max(unidade_producao) as un,
         max((coalesce(data_fim, data_hora) at time zone 'America/Sao_Paulo')::date) filter (where not em_andamento) as dia
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
revoke execute on function privado.recalcula_ciclo(uuid) from public, anon, authenticated;
