'use strict';
// Notificações — arquitetura pronta, envio real desabilitado por padrão.
// Nenhum envio é simulado como "enviado": quando o canal não está configurado,
// a notificação fica registrada como 'desabilitada' para auditoria.

const { db, getConf } = require('../db/database');
const { json } = require('../core');

const TEMPLATES = {
  novo: { assunto: 'Novo agendamento', msg: (a) => `Olá, ${a.cliente}! Seu agendamento de ${a.servico} foi registrado para ${a.data} às ${a.hora_inicio}.` },
  confirmacao: { assunto: 'Agendamento confirmado', msg: (a) => `Olá, ${a.cliente}! Seu agendamento de ${a.servico} em ${a.data} às ${a.hora_inicio} foi confirmado. Até logo!` },
  cancelamento: { assunto: 'Agendamento cancelado', msg: (a) => `Olá, ${a.cliente}! O agendamento de ${a.servico} em ${a.data} às ${a.hora_inicio} foi cancelado.` },
  remarcacao: { assunto: 'Agendamento remarcado', msg: (a) => `Olá, ${a.cliente}! Seu agendamento de ${a.servico} foi remarcado para ${a.data} às ${a.hora_inicio}.` },
  lembrete: { assunto: 'Lembrete de atendimento', msg: (a) => `Olá, ${a.cliente}! Lembrete: você tem ${a.servico} amanhã, ${a.data}, às ${a.hora_inicio}.` },
};

/**
 * Registra uma notificação para um agendamento.
 * Se o canal estiver habilitado na configuração, marca como 'pendente' (a ser enviada
 * pelo worker/fila quando o provedor for configurado). Caso contrário, 'desabilitada'.
 */
function criarNotificacao(agendamento, tipo, canal = 'interno') {
  const tpl = TEMPLATES[tipo];
  if (!tpl || !agendamento) return null;

  const cfg = getConf('notificacoes', {});
  const canalCfg = cfg[canal] || cfg.email || {};
  const habilitado = canal === 'interno' ? true : Boolean(canalCfg?.habilitado);

  const destino = canal === 'email'
    ? (db.prepare('SELECT email FROM clientes WHERE id = ?').get(agendamento.cliente_id)?.email || null)
    : (db.prepare('SELECT telefone FROM clientes WHERE id = ?').get(agendamento.cliente_id)?.telefone || null);

  const info = db.prepare(`
    INSERT INTO notificacoes (agendamento_id, tipo, canal, destinatario, assunto, mensagem, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    agendamento.id, tipo, canal, destino, tpl.assunto, tpl.msg(agendamento),
    habilitado && canal !== 'interno' ? 'pendente' : 'desabilitada'
  );
  return info.lastInsertRowid;
}

/** Gera lembretes para agendamentos de amanhã ainda sem lembrete enviado. */
function gerarLembretes() {
  const cfg = getConf('notificacoes', {});
  const antecedencia = Number(cfg.lembreteAntecedenciaHoras || 24);
  const amanha = new Date(Date.now() + antecedencia * 3600 * 1000).toISOString().slice(0, 10);

  const pendentes = db.prepare(`
    SELECT a.*, c.nome AS cliente, c.telefone, c.email, s.nome AS servico
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN servicos s ON s.id = a.servico_id
    LEFT JOIN lembretes_enviados le ON le.agendamento_id = a.id
    WHERE a.data = ? AND a.status IN ('pendente','confirmado') AND le.agendamento_id IS NULL
  `).all(amanha);

  for (const ag of pendentes) {
    criarNotificacao(ag, 'lembrete', 'email');
    criarNotificacao(ag, 'lembrete', 'whatsapp');
    db.prepare('INSERT INTO lembretes_enviados (agendamento_id) VALUES (?)').run(ag.id);
  }
  return pendentes.length;
}

function listarNotificacoes(req, res) {
  json(res, 200, db.prepare(`
    SELECT n.*, c.nome AS cliente FROM notificacoes n
    LEFT JOIN agendamentos a ON a.id = n.agendamento_id
    LEFT JOIN clientes c ON c.id = a.cliente_id
    ORDER BY n.criado_em DESC LIMIT 200
  `).all());
}

function listarAgendamentosPendentes(_req, res) {
  const agendamentos = db.prepare(`
    SELECT 'agendamento' AS tipo, a.id, a.cliente_id, a.profissional_id, a.servico_id, a.data, a.hora_inicio, a.criado_em,
           c.nome AS cliente, p.nome AS profissional, s.nome AS servico,
           pp.valor_sinal_centavos, pp.cliente_informou_em
    FROM agendamentos a
    JOIN pix_pagamentos pp ON pp.agendamento_id=a.id
    JOIN clientes c ON c.id=a.cliente_id
    JOIN profissionais p ON p.id=a.profissional_id
    JOIN servicos s ON s.id=a.servico_id
    WHERE a.origem='online' AND a.status='pendente' AND a.pagamento_status='aguardando'
      AND pp.provedor='manual' AND pp.status='aguardando' AND pp.cliente_informou_em IS NOT NULL
    ORDER BY pp.cliente_informou_em ASC
  `).all();
  const devolucoes = db.prepare(`
    SELECT 'reembolso' AS tipo, d.id, a.id AS agendamento_id, a.data, a.hora_inicio,
           c.nome AS cliente, s.nome AS servico, d.valor_centavos AS valor_sinal_centavos,
           d.observacao, d.criado_em
    FROM pix_devolucoes d
    JOIN pix_pagamentos pp ON pp.id=d.pagamento_id
    JOIN agendamentos a ON a.id=pp.agendamento_id
    JOIN clientes c ON c.id=a.cliente_id
    JOIN servicos s ON s.id=a.servico_id
    WHERE d.manual=1 AND d.status='em_processamento'
    ORDER BY d.criado_em ASC
  `).all();
  json(res, 200, [...agendamentos, ...devolucoes]);
}
module.exports = { criarNotificacao, gerarLembretes, listarNotificacoes, listarAgendamentosPendentes };
