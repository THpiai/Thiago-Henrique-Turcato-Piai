-- Etapa 1 (combinada com o Thiago em 08/10/2026): problema registrado rápido, estádio confirmado
-- pelo campo, foto do problema e safra como conjunto (Soja / Safrinha / Cana).

-- Problema: gravidade, quem viu e reabertura ("não resolveu" depois de um tratamento).
alter table public.campo
  add column gravidade   text check (gravidade in ('Leve','Média','Alta')),
  add column quem_viu    text check (quem_viu in ('Equipe','Vendedor','Agrônomo')),
  add column reaberto_em timestamptz;

-- Qualquer pessoa da equipe responde "resolveu?" de qualquer problema; o resto do registro
-- continua só com o autor e com dono/encarregado.
create policy campo_membro_responde on public.campo for update to authenticated
  using (privado.eh_membro()) with check (privado.eh_membro());

create function public.campo_so_resposta() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.autor_id is distinct from auth.uid() and not privado.eh_gestor() then
    if (to_jsonb(new) - array['status','resolvido_em','reaberto_em','updated_at'])
       is distinct from (to_jsonb(old) - array['status','resolvido_em','reaberto_em','updated_at']) then
      raise exception 'Só o autor, o dono ou o encarregado alteram este registro';
    end if;
  end if;
  return new;
end $$;
create trigger campo_so_resposta before update on public.campo
  for each row execute function public.campo_so_resposta();

-- Estádio confirmado por quem está no campo (o app mostra o estimado até alguém confirmar).
create table public.estadios (
  id          uuid primary key,
  data_hora   timestamptz not null,
  autor_id    uuid not null default auth.uid() references pessoas(id),
  talhao_id   uuid not null references talhoes(id),
  ciclo_id    uuid references ciclos(id),
  estadio     text not null,
  excluido_em timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.estadios (ciclo_id, data_hora desc);
alter table public.estadios enable row level security;
create policy membro_le on public.estadios for select to authenticated using (privado.eh_membro());
create policy membro_insere on public.estadios for insert to authenticated
  with check (privado.eh_membro() and autor_id = auth.uid());
create policy autor_ou_gestor_altera on public.estadios for update to authenticated
  using (autor_id = auth.uid() or privado.eh_gestor()) with check (privado.eh_membro());

-- Soja passa a se chamar "Soja AAAA/AA" (Safrinha e Cana continuam como estavam).
create or replace function privado.nome_safra(cultura text, d date) returns text
language sql immutable set search_path = '' as $$
  select case
    when cultura = 'Cana-de-açúcar' then
      'Cana ' || (case when extract(month from d) >= 4 then extract(year from d) else extract(year from d) - 1 end)::int
      || '/' || right(((case when extract(month from d) >= 4 then extract(year from d) else extract(year from d) - 1 end) + 1)::int::text, 2)
    when cultura in ('Milho','Sorgo') and extract(month from d) between 1 and 6 then 'Safrinha ' || extract(year from d)::int
    else
      (case when cultura = 'Soja' then 'Soja ' else 'Safra ' end)
      || (case when extract(month from d) >= 7 then extract(year from d) else extract(year from d) - 1 end)::int
      || '/' || right(((case when extract(month from d) >= 7 then extract(year from d) else extract(year from d) - 1 end) + 1)::int::text, 2)
  end
$$;
update public.ciclos set safra = 'Soja ' || substr(safra, 7) where cultura = 'Soja' and safra like 'Safra %';

-- Fotos dos problemas (privadas; só a equipe vê).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy fotos_equipe_le on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and privado.eh_membro());
create policy fotos_equipe_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and privado.eh_membro());
