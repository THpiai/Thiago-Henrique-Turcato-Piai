-- Safras passadas e rendimento: área plantada da safra (quando difere do talhão) e
-- custo de insumos por ha informado à mão (safras que não foram registradas no app).
alter table public.ciclos
  add column if not exists area_ha          numeric(10,2),
  add column if not exists custo_insumos_ha numeric(12,2);

alter table public.ciclos
  add constraint ciclos_historico check (
        coalesce(area_ha, 1) > 0 and coalesce(area_ha, 0) <= 5000
    and coalesce(custo_insumos_ha, 0) between 0 and 100000);
