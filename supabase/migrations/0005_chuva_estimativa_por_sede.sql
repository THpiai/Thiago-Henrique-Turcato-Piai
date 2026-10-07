-- A estimativa de chuva passou a ser uma por sede e dia (índice chuva_estimativa_dia, em 0004).
-- A regra antiga permitia só uma estimativa por dia para a fazenda toda e bloqueia a segunda sede.
drop index if exists public.chuva_estimativa_unica;
