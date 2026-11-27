-- Migração: adiciona campo para valor final cobrado (com desconto se aplicável)
ALTER TABLE agendamentos ADD COLUMN valor_final_centavos INTEGER;

-- Preenche valores existentes com o preço original do serviço
UPDATE agendamentos SET valor_final_centavos = (
  SELECT preco_centavos FROM servicos WHERE servicos.id = agendamentos.servico_id
) WHERE valor_final_centavos IS NULL;
