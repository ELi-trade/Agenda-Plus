'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'agendamento.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Migra dados existentes sem recriar o arquivo SQLite.
const colunasCliente = db.prepare('PRAGMA table_info(clientes)').all();
if (!colunasCliente.some((coluna) => coluna.name === 'senha_hash')) {
  db.exec('ALTER TABLE clientes ADD COLUMN senha_hash TEXT');
}

const colunasAgendamento = db.prepare('PRAGMA table_info(agendamentos)').all();
if (!colunasAgendamento.some((coluna) => coluna.name === 'pagamento_status')) {
  db.exec("ALTER TABLE agendamentos ADD COLUMN pagamento_status TEXT NOT NULL DEFAULT 'dispensado' CHECK (pagamento_status IN ('dispensado','aguardando','pago','cancelado','expirado','falha','reembolso_pendente','reembolsado','reembolso_parcial','retido'))");
}
if (!colunasAgendamento.some((coluna) => coluna.name === 'pagamento_expira_em')) {
  db.exec('ALTER TABLE agendamentos ADD COLUMN pagamento_expira_em TEXT');
}

const colunasPix = db.prepare('PRAGMA table_info(pix_pagamentos)').all();
const migracoesPix = [
  ['cliente_informou_em', 'TEXT'],
  ['conferido_em', 'TEXT'],
  ['conferido_por', 'INTEGER REFERENCES usuarios(id)'],
  ['pix_qr_data_uri', 'TEXT'],
  // Registros anteriores pertencem ao fluxo legado. Novos pagamentos definem
  // explicitamente o provedor manual ao serem criados.
  ['provedor', "TEXT NOT NULL DEFAULT 'legado'"],
];
for (const [nome, definicao] of migracoesPix) {
  if (!colunasPix.some((coluna) => coluna.name === nome)) db.exec(`ALTER TABLE pix_pagamentos ADD COLUMN ${nome} ${definicao}`);
}
const colunasDevolucoes = db.prepare('PRAGMA table_info(pix_devolucoes)').all();
if (!colunasDevolucoes.some((coluna) => coluna.name === 'manual')) {
  db.exec('ALTER TABLE pix_devolucoes ADD COLUMN manual INTEGER NOT NULL DEFAULT 0');
}
function marcarInicial(tabela, id) {
  db.prepare('INSERT OR IGNORE INTO marcadores_iniciais (tabela, registro_id) VALUES (?, ?)').run(tabela, Number(id));
}

function reconhecerDadosIniciaisAntigos() {
  const adminDemo = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@demo.local');
  if (!adminDemo) return;
  const inserir = db.prepare('INSERT OR IGNORE INTO marcadores_iniciais (tabela, registro_id) VALUES (?, ?)');
  for (const usuario of db.prepare('SELECT id FROM usuarios WHERE email IN (?, ?)').all('prof1@demo.local', 'recepcao@demo.local')) inserir.run('usuarios', usuario.id);
  for (const profissional of db.prepare('SELECT id FROM profissionais WHERE nome IN (?, ?)').all('Profissional Demo 1', 'Profissional Demo 2')) inserir.run('profissionais', profissional.id);
  for (const servico of db.prepare('SELECT id FROM servicos WHERE nome IN (?, ?) AND categoria IN (?, ?)').all('Limpeza de Pele', 'Design de Sobrancelhas', 'Facial', 'Sobrancelhas')) inserir.run('servicos', servico.id);
  for (const sala of db.prepare('SELECT id FROM salas WHERE nome IN (?, ?)').all('Sala 1', 'Sala 2')) inserir.run('salas', sala.id);
}
reconhecerDadosIniciaisAntigos();

// ---------- Helpers de senha (scrypt com salt) ----------
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senha, armazenado) {
  const [salt, hash] = String(armazenado || '').split(':');
  if (!salt || !hash) return false;
  const teste = crypto.scryptSync(senha, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(teste, 'hex'));
}

// ---------- Configurações chave/valor ----------
function getConf(chave, padrao = null) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  if (!row || row.valor == null) return padrao;
  try { return JSON.parse(row.valor); } catch { return row.valor; }
}

function setConf(chave, valor) {
  db.prepare(
    `INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
  ).run(chave, typeof valor === 'string' ? valor : JSON.stringify(valor));
}

// ---------- Seed inicial (somente se o banco estiver vazio) ----------
function seed() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (total > 0) return;

  const agora = new Date().toISOString().slice(0, 10);

  // Salas de demonstração
  const sala = db.prepare('INSERT INTO salas (nome) VALUES (?)');
  const s1 = sala.run('Sala 1').lastInsertRowid;
  const s2 = sala.run('Sala 2').lastInsertRowid;
  marcarInicial('salas', s1);
  marcarInicial('salas', s2);

  // Serviços de demonstração
  const srv = db.prepare(`INSERT INTO servicos (nome, descricao, categoria, preco_centavos, duracao_min, intervalo_min)
                          VALUES (?, ?, ?, ?, ?, ?)`);
  const servico1 = srv.run('Limpeza de Pele', 'Limpeza de pele profunda', 'Facial', 12000, 60, 10).lastInsertRowid;
  const servico2 = srv.run('Design de Sobrancelhas', 'Design com pinça', 'Sobrancelhas', 6000, 30, 5).lastInsertRowid;
  marcarInicial('servicos', servico1);
  marcarInicial('servicos', servico2);

  // Profissionais de demonstração
  const prof = db.prepare('INSERT INTO profissionais (nome, especialidade, telefone) VALUES (?, ?, ?)');
  const p1 = prof.run('Profissional Demo 1', 'Esteticista', '(11) 90000-0001').lastInsertRowid;
  const p2 = prof.run('Profissional Demo 2', 'Designer de sobrancelhas', '(11) 90000-0002').lastInsertRowid;
  marcarInicial('profissionais', p1);
  marcarInicial('profissionais', p2);

  db.prepare('INSERT INTO servico_profissional (servico_id, profissional_id) VALUES (?, ?)').run(servico1, p1);
  db.prepare('INSERT INTO servico_profissional (servico_id, profissional_id) VALUES (?, ?)').run(servico2, p1);
  db.prepare('INSERT INTO servico_profissional (servico_id, profissional_id) VALUES (?, ?)').run(servico2, p2);

  // Horários de trabalho de demonstração (seg-sex 09:00-18:00, pausa 12:00-13:00)
  const ht = db.prepare('INSERT INTO horarios_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)');
  const pz = db.prepare('INSERT INTO pausas_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)');
  for (const pid of [p1, p2]) {
    for (let dia = 1; dia <= 5; dia++) {
      const horarioId = ht.run(pid, dia, '09:00', '18:00').lastInsertRowid;
      const pausaId = pz.run(pid, dia, '12:00', '13:00').lastInsertRowid;
      marcarInicial('horarios_trabalho', horarioId);
      marcarInicial('pausas_trabalho', pausaId);
    }
  }

  // Usuários de demonstração
  const usu = db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil, profissional_id) VALUES (?, ?, ?, ?, ?)`);
  const adminId = usu.run('Administrador', 'admin@demo.local', hashSenha('admin123'), 'admin', null).lastInsertRowid;
  const profUserId = usu.run('Profissional Demo 1', 'prof1@demo.local', hashSenha('prof123'), 'profissional', p1).lastInsertRowid;
  const recepId = usu.run('Recepção Demo', 'recepcao@demo.local', hashSenha('recep123'), 'recepcao', null).lastInsertRowid;
  marcarInicial('usuarios', adminId);
  marcarInicial('usuarios', profUserId);
  marcarInicial('usuarios', recepId);

  // Horário de funcionamento (seg-sáb 09:00-18:00)
  const hf = db.prepare('INSERT INTO horario_funcionamento (dia_semana, aberto, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)');
  for (let dia = 1; dia <= 6; dia++) marcarInicial('horario_funcionamento', hf.run(dia, 1, '09:00', '18:00').lastInsertRowid);
  marcarInicial('horario_funcionamento', hf.run(0, 0, null, null).lastInsertRowid);

  setConf('estabelecimento', {
    nome: 'Estabelecimento Demonstração',
    endereco: '',
    telefone: '',
    logo: '',
    corPrimaria: '#00B1C5',
  });
  setConf('notificacoes', {
    email: { habilitado: false, host: '', porta: 587, usuario: '', senha: '', de: '' },
    whatsapp: { habilitado: false, provedor: '', token: '', numeroOrigem: '' },
    sms: { habilitado: false, provedor: '', token: '', numeroOrigem: '' },
    lembreteAntecedenciaHoras: 24,
  });

  console.log('[seed] Banco inicializado com dados de DEMONSTRAÇÃO.');
  console.log('[seed] Usuários: admin@demo.local / admin123 · prof1@demo.local / prof123 · recepcao@demo.local / recep123');
}

seed();

module.exports = { db, hashSenha, verificarSenha, getConf, setConf, DB_PATH };
