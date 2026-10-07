-- Tira as funções de permissão da API pública (aviso de segurança do Supabase).
create schema if not exists privado;
alter function public.eh_membro() set schema privado;
alter function public.eh_dono() set schema privado;
alter function public.eh_gestor() set schema privado;
revoke all on function privado.eh_membro(), privado.eh_dono(), privado.eh_gestor() from public, anon;
grant usage on schema privado to authenticated;
grant execute on function privado.eh_membro(), privado.eh_dono(), privado.eh_gestor() to authenticated;
