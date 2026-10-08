-- Lixeira: registros apagados ficam marcados (excluido_em) e podem ser restaurados.
-- Estoque e custo ignoram o que está na lixeira; produtos de uma operação apagada voltam ao saldo.
alter table public.operacoes   add column excluido_em timestamptz;
alter table public.campo       add column excluido_em timestamptz;
alter table public.estoque_mov add column excluido_em timestamptz;
alter table public.chuva       add column excluido_em timestamptz;
alter table public.ciclos      add column excluido_em timestamptz;

create or replace view public.v_estoque with (security_invoker = true) as
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
               from estoque_mov where excluido_em is null group by insumo_id) e on e.insumo_id = i.id
  left join (select op.insumo_id, sum(op.quantidade_total) as usado
               from operacao_produtos op join operacoes o on o.id = op.operacao_id
              where o.excluido_em is null group by op.insumo_id) u on u.insumo_id = i.id;

create or replace view public.v_custo_ciclo with (security_invoker = true) as
select c.id as ciclo_id, c.talhao_id, c.safra, c.cultura, t.area_ha,
       sum(op.quantidade_total * ve.custo_medio)                 as custo_insumos,
       sum(op.quantidade_total * ve.custo_medio) / nullif(t.area_ha,0) as custo_por_ha
  from ciclos c
  join talhoes t on t.id = c.talhao_id
  left join operacoes o on o.ciclo_id = c.id and o.excluido_em is null
  left join operacao_produtos op on op.operacao_id = o.id
  left join v_estoque ve on ve.insumo_id = op.insumo_id
 where c.excluido_em is null
 group by c.id, c.talhao_id, c.safra, c.cultura, t.area_ha;

create or replace function public.preenche_ciclo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ciclo_id is null then
    select id into new.ciclo_id from ciclos
     where talhao_id = new.talhao_id and status = 'Em andamento' and excluido_em is null
     order by data_plantio desc nulls last limit 1;
  end if;
  return new;
end $$;

-- Quem leu o pluviômetro pode corrigir ou apagar a própria leitura.
create policy chuva_autor_altera on public.chuva for update to authenticated
  using (autor_id = auth.uid()) with check (privado.eh_membro() and autor_id = auth.uid());
