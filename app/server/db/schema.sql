-- ============================================================
-- Sistema de Agendamento — Schema SQLite
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Usuários e autenticação ----------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  perfil        TEXT NOT NULL CHECK (perfil IN ('admin','gestor','profissional','recepcao')),
  ativo         INTEGER NOT NULL DEFAULT 1,
  profissional_id INTEGER REFERENCES profissionais(id),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token       TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens_recuperacao (
  token     TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL,
  usado     INTEGER NOT NULL DEFAULT 0
);

-- ---------- Estabelecimento / configurações ----------
CREATE TABLE IF NOT EXISTS configuracoes (
  chave  TEXT PRIMARY KEY,
  valor  TEXT
);

-- ---------- Salas ----------
CREATE TABLE IF NOT EXISTS salas (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nome   TEXT NOT NULL,
  ativa  INTEGER NOT NULL DEFAULT 1
);

-- ---------- Serviços / procedimentos ----------
CREATE TABLE IF NOT EXISTS servicos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL,
  descricao       TEXT,
  categoria       TEXT,
  preco_centavos  INTEGER NOT NULL DEFAULT 0 CHECK (preco_centavos >= 0),
  duracao_min     INTEGER NOT NULL DEFAULT 30 CHECK (duracao_min > 0),
  intervalo_min   INTEGER NOT NULL DEFAULT 0 CHECK (intervalo_min >= 0),
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Clientes ----------
CREATE TABLE IF NOT EXISTS clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  telefone      TEXT,
  email         TEXT,
  data_nascimento TEXT,
  observacoes   TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  senha_hash    TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Profissionais ----------
CREATE TABLE IF NOT EXISTS profissionais (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT NOT NULL,
  especialidade  TEXT,
  telefone       TEXT,
  email          TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Profissionais habilitados para cada serviço (N:N)
CREATE TABLE IF NOT EXISTS servico_profissional (
  servico_id       INTEGER NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  PRIMARY KEY (servico_id, profissional_id)
);

-- ---------- Horários de trabalho ----------
-- dias_semana: 0=domingo .. 6=sábado
CREATE TABLE IF NOT EXISTS horarios_trabalho (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  dia_semana       INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio      TEXT NOT NULL,          -- 'HH:MM'
  hora_fim         TEXT NOT NULL,          -- 'HH:MM'
  CHECK (hora_fim > hora_inicio)
);

-- Intervalo/pausa dentro do dia (ex.: almoço)
CREATE TABLE IF NOT EXISTS pausas_trabalho (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  profissional_id  INTEGER NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  dia_semana       INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio      TEXT NOT NULL,
  hora_fim         TEXT NOT NULL,
  CHECK (hora_fim > hora_inicio)
);

-- ---------- Bloqueios de agenda (férias, folgas, compromissos) ----------
CREATE TABLE IF NOT EXISTS bloqueios (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  profissional_id  INTEGER REFERENCES profissionais(id) ON DELETE CASCADE, -- NULL = toda a clínica
  data_inicio      TEXT NOT NULL,      -- 'YYYY-MM-DD'
  data_fim         TEXT NOT NULL,      -- 'YYYY-MM-DD' (inclusivo)
  hora_inicio      TEXT,               -- NULL = o dia inteiro
  hora_fim         TEXT,
  motivo           TEXT,
  criado_em        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (data_fim >= data_inicio)
);

-- ---------- Agendamentos ----------
CREATE TABLE IF NOT EXISTS agendamentos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id),
  profissional_id   INTEGER NOT NULL REFERENCES profissionais(id),
  servico_id        INTEGER NOT NULL REFERENCES servicos(id),
  sala_id           INTEGER REFERENCES salas(id),
  data              TEXT NOT NULL,       -- 'YYYY-MM-DD'
  hora_inicio       TEXT NOT NULL,       -- 'HH:MM'
  hora_fim          TEXT NOT NULL,       -- 'HH:MM'
  status            TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','confirmado','em_atendimento','finalizado','falta','cancelado')),
  origem            TEXT NOT NULL DEFAULT 'sistema' CHECK (origem IN ('sistema','online')),
  pagamento_status  TEXT NOT NULL DEFAULT 'dispensado' CHECK (pagamento_status IN ('dispensado','aguardando','pago','cancelado','expirado','falha','reembolso_pendente','reembolsado','reembolso_parcial','retido')),
  pagamento_expira_em TEXT,
  valor_final_centavos INTEGER,
  observacoes       TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data       ON agendamentos(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_prof       ON agendamentos(profissional_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_sala       ON agendamentos(sala_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente    ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status     ON agendamentos(status);

-- Pagamentos Pix manuais vinculados ao sinal de agendamento online.
CREATE TABLE IF NOT EXISTS pix_pagamentos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id        INTEGER NOT NULL UNIQUE REFERENCES agendamentos(id) ON DELETE CASCADE,
  txid                  TEXT NOT NULL UNIQUE,
  checkout_token_hash   TEXT NOT NULL,
  valor_total_centavos  INTEGER NOT NULL CHECK (valor_total_centavos > 0),
  valor_sinal_centavos  INTEGER NOT NULL CHECK (valor_sinal_centavos > 0),
  status                TEXT NOT NULL DEFAULT 'criando' CHECK (status IN ('criando','aguardando','pago','expirado','cancelado','reembolso_pendente','reembolsado','reembolso_parcial','retido','erro')),
  location              TEXT,
  pix_copia_e_cola      TEXT,
  end_to_end_id         TEXT,
  pago_em               TEXT,
  expira_em             TEXT NOT NULL,
  cliente_informou_em   TEXT,
  conferido_em          TEXT,
  conferido_por         INTEGER REFERENCES usuarios(id),
  pix_qr_data_uri       TEXT,
  provedor              TEXT NOT NULL DEFAULT 'manual',
  ultima_consulta_em    TEXT,
  criado_em             TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pix_pagamentos_status ON pix_pagamentos(status, expira_em);

CREATE TABLE IF NOT EXISTS pix_devolucoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pagamento_id    INTEGER NOT NULL REFERENCES pix_pagamentos(id) ON DELETE CASCADE,
  santander_id    TEXT NOT NULL UNIQUE,
  end_to_end_id   TEXT NOT NULL,
  valor_centavos  INTEGER NOT NULL CHECK (valor_centavos > 0),
  status          TEXT NOT NULL DEFAULT 'solicitando' CHECK (status IN ('solicitando','em_processamento','devolvido','falha')),
  observacao      TEXT,
  resposta        TEXT,
  manual          INTEGER NOT NULL DEFAULT 0,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pix_devolucoes_pagamento ON pix_devolucoes(pagamento_id, status);

-- ---------- Horário de funcionamento do estabelecimento ----------
CREATE TABLE IF NOT EXISTS horario_funcionamento (
  dia_semana   INTEGER PRIMARY KEY CHECK (dia_semana BETWEEN 0 AND 6),
  aberto       INTEGER NOT NULL DEFAULT 0,
  hora_inicio  TEXT,
  hora_fim     TEXT
);

-- ---------- Notificações (arquitetura; envio real é configurável) ----------
CREATE TABLE IF NOT EXISTS notificacoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id  INTEGER REFERENCES agendamentos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('novo','confirmacao','cancelamento','remarcacao','lembrete')),
  canal           TEXT NOT NULL CHECK (canal IN ('email','whatsapp','sms','interno')),
  destinatario    TEXT,
  assunto         TEXT,
  mensagem        TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviada','falha','desabilitada')),
  erro            TEXT,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  enviada_em      TEXT
);

-- Agendamentos já processados por lembrete (evita duplicidade)
CREATE TABLE IF NOT EXISTS lembretes_enviados (
  agendamento_id INTEGER PRIMARY KEY REFERENCES agendamentos(id) ON DELETE CASCADE,
  enviado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes_clientes (
  token       TEXT PRIMARY KEY,
  cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_clientes_cliente ON sessoes_clientes(cliente_id);

-- Marca apenas dados criados pelo seed de demonstracao para permitir limpeza seletiva.
CREATE TABLE IF NOT EXISTS marcadores_iniciais (
  tabela      TEXT NOT NULL CHECK (tabela IN ('usuarios','servicos','profissionais','salas','horarios_trabalho','pausas_trabalho','horario_funcionamento')),
  registro_id INTEGER NOT NULL,
  PRIMARY KEY (tabela, registro_id)
);

-- Lancamentos financeiros locais; criados de forma aditiva para manter bancos existentes.
CREATE TABLE IF NOT EXISTS lancamentos_financeiros (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('receber','pagar')),
  descricao       TEXT NOT NULL,
  valor_centavos  INTEGER NOT NULL CHECK (valor_centavos > 0),
  vencimento      TEXT NOT NULL,
  data_pagamento  TEXT,
  status          TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','nao_pago','realizado','cancelado')),
  cliente_id      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  categoria       TEXT,
  observacoes     TEXT,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_financeiro_tipo_vencimento ON lancamentos_financeiros(tipo, vencimento);
CREATE INDEX IF NOT EXISTS idx_financeiro_status ON lancamentos_financeiros(status);

-- ===========================================================
-- Clube de Assinaturas — direitos de utilização (não é carteira)
-- ===========================================================

-- 1. Planos cadastrados pelo estabelecimento.
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                  TEXT NOT NULL,
  descricao             TEXT,
  mensalidade_centavos  INTEGER NOT NULL CHECK (mensalidade_centavos > 0),
  desconto_adicional_pct INTEGER NOT NULL DEFAULT 0 CHECK (desconto_adicional_pct BETWEEN 0 AND 100),
  validade_beneficios_dias INTEGER NOT NULL DEFAULT 31 CHECK (validade_beneficios_dias > 0),
  transferir_expirados  INTEGER NOT NULL DEFAULT 0,  -- 1 = benefícios não usados viram crédito do próximo ciclo
  cancelamento_dias     INTEGER NOT NULL DEFAULT 0,  -- aviso mínimo (dias) para cancelar sem multa
  ativo                 INTEGER NOT NULL DEFAULT 1,
  criado_em             TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Serviços do catálogo incluídos no plano, com quantidade por ciclo.
CREATE TABLE IF NOT EXISTS subscription_plan_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id       INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  servico_id     INTEGER NOT NULL REFERENCES servicos(id),
  quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
  UNIQUE (plano_id, servico_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_items_plano ON subscription_plan_items(plano_id);

-- 3. Assinaturas dos clientes.
CREATE TABLE IF NOT EXISTS subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id        INTEGER NOT NULL REFERENCES subscription_plans(id),
  cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','ativa','cancelada','cancelamento_solicitado','expirada')),
  inicio_em       TEXT,
  cancelada_em    TEXT,
  cancelamento_motivo TEXT,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cliente_id, plano_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_cliente ON subscriptions(cliente_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_plano ON subscriptions(plano_id, status);

-- 4. Ciclos mensais (1 ciclo = 1 período pago).
CREATE TABLE IF NOT EXISTS subscription_cycles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assinatura_id   INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  inicio_em       TEXT NOT NULL,
  fim_em          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'aguardando_pagamento'
                  CHECK (status IN ('aguardando_pagamento','ativo','expirado','cancelado')),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cycles_assinatura ON subscription_cycles(assinatura_id, status);

-- 5. Direitos de utilização por serviço em cada ciclo.
CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ciclo_id      INTEGER NOT NULL REFERENCES subscription_cycles(id) ON DELETE CASCADE,
  servico_id    INTEGER NOT NULL REFERENCES servicos(id),
  quantidade    INTEGER NOT NULL CHECK (quantidade > 0),
  usados        INTEGER NOT NULL DEFAULT 0,
  reservados    INTEGER NOT NULL DEFAULT 0,
  transferidos  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ciclo_id, servico_id)
);
CREATE INDEX IF NOT EXISTS idx_ent_ciclo ON subscription_entitlements(ciclo_id, servico_id);

-- 6. Histórico de utilização (reserva, consumo, liberação).
CREATE TABLE IF NOT EXISTS subscription_usage (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  entitlement_id INTEGER NOT NULL REFERENCES subscription_entitlements(id) ON DELETE CASCADE,
  agendamento_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL,
  cliente_id     INTEGER NOT NULL REFERENCES clientes(id),
  servico_id     INTEGER NOT NULL REFERENCES servicos(id),
  acao           TEXT NOT NULL CHECK (acao IN ('reservado','consumido','liberado','expirado','transferido')),
  quantidade     INTEGER NOT NULL DEFAULT 1,
  detalhes       TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_cliente ON subscription_usage(cliente_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_usage_agendamento ON subscription_usage(agendamento_id);

-- 7. Pagamentos (mensalidades).
CREATE TABLE IF NOT EXISTS subscription_payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  assinatura_id  INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  ciclo_id       INTEGER REFERENCES subscription_cycles(id) ON DELETE SET NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','pago','recusado','cancelado','reembolsado')),
  metodo         TEXT,
  referencia     TEXT,
  pago_em        TEXT,
  confirmado_por INTEGER REFERENCES usuarios(id),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pay_assinatura ON subscription_payments(assinatura_id, status);

-- 8. Auditoria de operações sensíveis.
CREATE TABLE IF NOT EXISTS subscription_audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER REFERENCES usuarios(id),
  cliente_id    INTEGER REFERENCES clientes(id),
  acao          TEXT NOT NULL,
  entidade      TEXT,
  entidade_id   INTEGER,
  detalhes      TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_clube ON subscription_audit_logs(acao, criado_em);
