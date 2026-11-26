'use strict';
// Rotas de agendamentos e disponibilidade (área autenticada)

const { db } = require('../db/database');
const { json, erro, lerCorpo, exigirCampos, validarData, validarHora } = require('../core');
const { slotsDoProfissional, validarAgendamento } = require('../disponibilidade');
const { criarNotificacao } = require('./notificacoes');

const pagamentosPix = require('../pagamentos');

const STATUS_TRANSICOES = {
  pendente: ['confirmado', 'cancelado', 'falta'],
  confirmado: ['em_atendimento', 'cancelado', 'falta'],
  em_atendimento: ['finalizado', 'falta'],
  finalizado: [],
  falta: [],
  cancelado: ['pendente'], // permite reativar um cancelado por engano
};

async function listarAgendamentos(req, res, usuario) {
  const url = new URL(req.url, 'http://x');
  const de = url.searchParams.get('de');
  const ate = url.searchParams.get('ate');
  const prof = url.searchParams.get('profissional_id');
  const sala = url.searchParams.get('sala_id');
  const servico = url.searchParams.get('servico_id');
  const status = url.searchParams.get('status');

  // Profissional só vê a própria agenda
  let filtroProf = prof;
  if (usuario.perfil === 'profissional' && usuario.profissional_id) filtroProf = String(usuario.profissional_id);

  const conds = ["(a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))"]; const params = [];
  if (de) { conds.push('a.data >= ?'); params.push(de); }
  if (ate) { conds.push('a.data <= ?'); params.push(ate); }
  if (filtroProf) { conds.push('a.profissional_id = ?'); params.push(filtroProf); }
  if (sala) { conds.push('a.sala_id = ?'); params.push(sala); }
  if (servico) { conds.push('a.servico_id = ?'); params.push(servico); }
  if (status) { conds.push('a.status = ?'); params.push(status); }

  const sql = `
    SELECT a.*, c.nome AS cliente, c.telefone AS cliente_telefone,
           p.nome AS profissional, s.nome AS servico, s.duracao_min, sa.nome AS sala
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN profissionais p ON p.id = a.profissional_id
    JOIN servicos s ON s.id = a.servico_id
    LEFT JOIN salas sa ON sa.id = a.sala_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY a.data, a.hora_inicio LIMIT 1000
  `;
  json(res, 200, db.prepare(sql).all(...params));
}

async function obterAgendamento(req, res, _u, id) {
  const a = db.prepare(`
    SELECT a.*, c.nome AS cliente, c.telefone AS cliente_telefone, c.email AS cliente_email,
           p.nome AS profissional, s.nome AS servico, s.duracao_min, sa.nome AS sala
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN profissionais p ON p.id = a.profissional_id
    JOIN servicos s ON s.id = a.servico_id
    LEFT JOIN salas sa ON sa.id = a.sala_id
    WHERE a.id = ? AND (a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))
  `).get(id);
  if (!a) return erro(res, 404, 'Agendamento não encontrado');
  json(res, 200, a);
}

async function criarAgendamento(req, res, _u) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['cliente_id', 'profissional_id', 'servico_id', 'data', 'hora_inicio']);
  if (!validarData(c.data)) return erro(res, 400, 'Data inválida');
  if (!validarHora(c.hora_inicio)) return erro(res, 400, 'Hora inválida');

  // duplicidade exata
  const dup = db.prepare(`
    SELECT id FROM agendamentos
    WHERE cliente_id=? AND profissional_id=? AND servico_id=? AND data=? AND hora_inicio=?
      AND status IN ('pendente','confirmado','em_atendimento')
  `).get(c.cliente_id, c.profissional_id, c.servico_id, c.data, c.hora_inicio);
  if (dup) return erro(res, 409, 'Agendamento duplicado (mesmo cliente, profissional, data e horário)');

  const val = validarAgendamento({
    profissionalId: c.profissional_id, servicoId: c.servico_id, salaId: c.sala_id || null,
    data: c.data, horaInicio: c.hora_inicio,
  });
  if (!val.ok) return erro(res, 409, val.motivo);

  const info = db.prepare(`
    INSERT INTO agendamentos (cliente_id, profissional_id, servico_id, sala_id, data, hora_inicio, hora_fim, origem, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'sistema', ?)
  `).run(c.cliente_id, c.profissional_id, c.servico_id, c.sala_id || null, c.data, c.hora_inicio, val.horaFim, c.observacoes || null);

  const ag = db.prepare('SELECT a.*, c.nome AS cliente, s.nome AS servico FROM agendamentos a JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id WHERE a.id=?').get(info.lastInsertRowid);
  criarNotificacao(ag, 'novo');
  json(res, 201, { id: info.lastInsertRowid });
}

async function editarAgendamento(req, res, usuario, id) {
  const atual = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id);
  if (!atual) return erro(res, 404, 'Agendamento não encontrado');
  if (['finalizado', 'falta'].includes(atual.status)) {
    return erro(res, 409, 'Agendamento finalizado não pode ser editado');
  }
  const c = await lerCorpo(req);
  exigirCampos(c, ['cliente_id', 'profissional_id', 'servico_id', 'data', 'hora_inicio']);
  if (!validarData(c.data)) return erro(res, 400, 'Data inválida');
  if (!validarHora(c.hora_inicio)) return erro(res, 400, 'Hora inválida');

  const novoStatus = c.status || atual.status;
  if (!Object.prototype.hasOwnProperty.call(STATUS_TRANSICOES, novoStatus)) {
    return erro(res, 400, 'Status de agendamento invalido');
  }
  const mudouStatus = novoStatus !== atual.status;
  if (mudouStatus && usuario.perfil !== 'admin' &&
      !(STATUS_TRANSICOES[atual.status] || []).includes(novoStatus)) {
    return erro(res, 409, 'Transicao de status invalida para este perfil');
  }

  if (mudouStatus && novoStatus === 'cancelado') await pagamentosPix.cancelarAdmin(Number(id));

  const mudouHorario = c.data !== atual.data || c.hora_inicio !== atual.hora_inicio ||
    c.profissional_id !== atual.profissional_id;

  if (mudouHorario) {
    const val = validarAgendamento({
      agendamentoId: Number(id),
      profissionalId: c.profissional_id, servicoId: c.servico_id, salaId: c.sala_id || null,
      data: c.data, horaInicio: c.hora_inicio,
    });
    if (!val.ok) return erro(res, 409, val.motivo);
  }

  const horaFim = mudouHorario ? validarAgendamento({
    agendamentoId: Number(id), profissionalId: c.profissional_id, servicoId: c.servico_id,
    data: c.data, horaInicio: c.hora_inicio,
  }).horaFim : atual.hora_fim;

  db.prepare(`
    UPDATE agendamentos SET cliente_id=?, profissional_id=?, servico_id=?, sala_id=?, data=?, hora_inicio=?, hora_fim=?,
      status=?, observacoes=?, atualizado_em=datetime('now') WHERE id=?
  `).run(c.cliente_id, c.profissional_id, c.servico_id, c.sala_id || null, c.data, c.hora_inicio, horaFim,
    novoStatus, c.observacoes ?? atual.observacoes, id);

  if (mudouHorario || mudouStatus) {
    const ag = db.prepare('SELECT a.*, c.nome AS cliente, s.nome AS servico FROM agendamentos a JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id WHERE a.id=?').get(id);
    if (mudouHorario) criarNotificacao(ag, 'remarcacao');
    if (mudouStatus && novoStatus === 'confirmado') criarNotificacao(ag, 'confirmacao');
    if (mudouStatus && novoStatus === 'cancelado') criarNotificacao(ag, 'cancelamento');
  }
  json(res, 200, { ok: true, status: novoStatus });
}

async function alterarStatus(req, res, usuario, id) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['status']);
  const atual = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id);
  if (!atual) return erro(res, 404, 'Agendamento não encontrado');
  const permitidos = STATUS_TRANSICOES[atual.status] || [];
  if (!permitidos.includes(c.status)) return erro(res, 409, `Transição inválida: ${atual.status} → ${c.status}`);

  let aviso;
  let pagamento = atual.origem === 'online'
    ? db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(id)
    : null;
  if (pagamento && pagamento.provedor === 'manual' &&
      ((c.status === 'confirmado') || (c.status === 'cancelado' && c.pixRecebido === true)) &&
      usuario.perfil !== 'admin') {
    return erro(res, 403, 'Somente o administrador pode conferir o recebimento Pix.');
  }
  if (c.status === 'confirmado' && pagamento && pagamento.provedor === 'manual' && pagamento.status !== 'pago') {
    try { pagamentosPix.confirmarPagamentoManual(Number(id), usuario.id); pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(id); }
    catch (e) { return erro(res, 409, e.message); }
  }
  if (c.status === 'confirmado' && pagamento && pagamento.status !== 'pago') {
    return erro(res, 409, 'Confira o recebimento Pix antes de confirmar o agendamento.');
  }
  if (c.status === 'cancelado') {
    if (pagamento && pagamento.provedor === 'manual' && pagamento.status === 'aguardando' &&
        pagamento.cliente_informou_em && c.pixRecebido === true) {
      try { pagamentosPix.confirmarPagamentoManual(Number(id), usuario.id); }
      catch (e) { return erro(res, 409, e.message); }
    }
    const resultadoCancelamento = await pagamentosPix.cancelarAdmin(Number(id));
    if (resultadoCancelamento.verificarRecebimento) {
      aviso = 'Confira se o Pix entrou. Se recebeu, faça a devolução pelo banco.';
    } else if (resultadoCancelamento.status === 'manual_pendente') {
      aviso = `Faça a devolução de ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(resultadoCancelamento.valorCentavos/100)} pelo banco e marque como concluída na fila de notificações.`;
    }
  }
  db.prepare('UPDATE agendamentos SET status=?, atualizado_em=datetime(\'now\') WHERE id=?').run(c.status, id);
  const ag = db.prepare('SELECT a.*, c.nome AS cliente, s.nome AS servico FROM agendamentos a JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id WHERE a.id=?').get(id);
  if (c.status === 'confirmado') criarNotificacao(ag, 'confirmacao');
  if (c.status === 'cancelado') criarNotificacao(ag, 'cancelamento');
  if (c.status === 'finalizado') {
    const pag = atual.origem === 'online' ? db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(id) : null;
    const totalC = pag ? pag.valor_total_centavos : db.prepare('SELECT s.preco_centavos AS v FROM agendamentos a JOIN servicos s ON s.id=a.servico_id WHERE a.id=?').get(id).v;
    const sinalC = pag ? pag.valor_sinal_centavos : 0;
    pagamentosPix.registrarReceita(id, totalC - sinalC, 'Restante - ' + ag.servico, 'restante');
    if (!pag) pagamentosPix.registrarReceita(id, totalC, 'Atendimento - ' + ag.servico, 'sinal');
  }
  json(res, 200, { ok: true, status: c.status, aviso });
}
async function excluirAgendamento(req, res, _u, id) {
  const atual = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id);
  if (!atual) return erro(res, 404, 'Agendamento não encontrado');
  const pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(id);
  if (pagamento && (['pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'].includes(pagamento.status) || pagamento.cliente_informou_em)) {
    return erro(res, 409, 'Este agendamento possui histórico Pix. Cancele-o para preservar o registro de pagamento/devolução.');
  }
  if (pagamento) await pagamentosPix.cancelarAdmin(Number(id));
  db.prepare('DELETE FROM agendamentos WHERE id = ?').run(id);
  json(res, 200, { ok: true });
}
// ---------- Disponibilidade ----------
async function consultarSlots(req, res) {
  const url = new URL(req.url, 'http://x');
  const profissionalId = Number(url.searchParams.get('profissional_id'));
  const servicoId = Number(url.searchParams.get('servico_id'));
  const data = url.searchParams.get('data');
  if (!profissionalId || !servicoId || !validarData(data)) {
    return erro(res, 400, 'Parâmetros inválidos: profissional_id, servico_id, data (YYYY-MM-DD)');
  }
  const r = slotsDoProfissional(profissionalId, servicoId, data);
  if (r.erro) return erro(res, 400, r.erro);
  json(res, 200, r);
}

module.exports = {
  listarAgendamentos, obterAgendamento, criarAgendamento, editarAgendamento,
  alterarStatus, excluirAgendamento, consultarSlots,
};
