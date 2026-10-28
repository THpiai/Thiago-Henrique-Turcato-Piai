-- Insumo cadastrado errado (ou repetido) vai para a lixeira e pode ser restaurado.
-- Some das listas de escolha; o histórico de operações e estoque continua mostrando o nome.
-- Quem altera continua sendo só dono e encarregado (política gestor_altera da 0001).
alter table public.insumos add column excluido_em timestamptz;
