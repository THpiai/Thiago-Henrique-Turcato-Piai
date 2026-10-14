-- Leitura do pluviômetro da sede: talhao_id nulo, sede_id preenchido, fonte 'Pluviômetro'.
-- Vale para os talhões mais próximos da sede (o app decide pela distância) e vence a estimativa.
-- A regra antiga de 0001 (uma estimativa por dia para a fazenda toda) bloqueava a Carlim;
-- repete aqui o que 0005 faz, para o banco ficar certo mesmo se 0005 não tiver rodado.
drop index if exists public.chuva_estimativa_unica;

-- Leitura sem talhão precisa dizer de qual sede é.
alter table public.chuva
  add constraint chuva_talhao_ou_sede check (talhao_id is not null or sede_id is not null);
