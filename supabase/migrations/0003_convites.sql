-- PENDENTE: aguarda aprovação do Thiago antes de aplicar.
-- Quem pode entrar: o dono convida pelo e-mail; ao criar a conta, a pessoa vira membro.
create table public.convites (
  email      text primary key check (email = lower(email)),
  nome       text not null,
  perfil     text not null default 'operador' check (perfil in ('dono','encarregado','operador')),
  created_at timestamptz not null default now()
);
alter table public.convites enable row level security;
create policy dono_le on public.convites for select to authenticated using (privado.eh_dono());
create policy dono_insere on public.convites for insert to authenticated with check (privado.eh_dono());
create policy dono_altera on public.convites for update to authenticated using (privado.eh_dono());
create policy dono_apaga on public.convites for delete to authenticated using (privado.eh_dono());

create function privado.aceita_convite() returns trigger
language plpgsql security definer set search_path = public as $$
declare c convites;
begin
  select * into c from convites where email = lower(new.email);
  if found then
    insert into pessoas (id, nome, email, perfil) values (new.id, c.nome, lower(new.email), c.perfil)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
revoke all on function privado.aceita_convite() from public, anon, authenticated;
create trigger ao_criar_conta after insert on auth.users for each row execute function privado.aceita_convite();

insert into convites (email, nome, perfil) values ('thihetupi@gmail.com', 'Thiago', 'dono');
