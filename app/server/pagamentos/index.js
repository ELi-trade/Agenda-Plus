'use strict';

const crypto = require('node:crypto');
const { db, getConf } = require('../db/database');
const { json, erro } = require('../core');
const { gerarPixEstatico, qrDataUri } = require('./pix-brcode');
const { criarNotificacao } = require('../routes/notificacoes');

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function tokenConfere(token, armazenado) {
  const esperado = Buffer.from(String(armazenado || ''), 'hex');
  const recebido = Buffer.from(tokenHash(token), 'hex');
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

function dadosRecebedor() {
  const estabelecimento = getConf('estabelecimento', {});
  const endereco = String(estabelecimento.endereco || '');
  const cidadeDoEndereco = endereco.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}(?:,|\s|$)/i)?.[1] || '';
  return {
    chave: process.env.PIX_CHAVE || '',
    nome: process.env.PIX_NOME_RECEBEDOR || estabelecimento.nome || '',
    cidade: process.env.PIX_CIDADE_RECEBEDOR || estabelecimento.cidade || cidadeDoEndereco,
  };
}

function detalhesCheckout(row, incluirQr = false) {
  const recebedor = dadosRecebedor();
  return {
    id: row.agendamento_id,
    txid: row.txid,
    status: row.status,
    valorTotalCentavos: row.valor_total_centavos,
    valorSinalCentavos: row.valor_sinal_centavos,
    pixCopiaECola: row.pix_copia_e_cola,
    pixQrDataUri: incluirQr ? row.pix_qr_data_uri : undefined,
    chavePix: recebedor.chave,
    nomeRecebedor: recebedor.nome,
    expiraEm: row.expira_em,
    clienteInformou: Boolean(row.cliente_informou_em),
    reembolsoPendente: row.status === 'reembolso_pendente',
  };
}

async function criarPagamento({ agendamentoId, servico, valorFinalCentavos }) {
  const recebedor = dadosRecebedor();
  if (!recebedor.chave) throw new Error('Cadastre a chave Pix do estabelecimento no arquivo .env.');
  const valorTotal = Number(valorFinalCentavos ?? servico.preco_centavos);
  const valorSinal = Math.round(valorTotal / 2);
  if (!Number.isSafeInteger(valorTotal) || valorTotal <= 0 || valorSinal <= 0) {
    throw new Error('Este serviço precisa ter um preço maior que zero para receber agendamentos online.');
  }

  const txid = crypto.randomBytes(10).toString('hex').toUpperCase();
  const checkoutToken = crypto.randomBytes(32).toString('hex');
  const minutosReserva = Math.max(5, Math.min(60, Number(process.env.PIX_RESERVA_MINUTOS || 15)));
  const expiraEm = new Date(Date.now() + minutosReserva * 60 * 1000).toISOString();
  const pixCopiaECola = gerarPixEstatico({
    chave: recebedor.chave,
    valorCentavos: valorSinal,
    nomeRecebedor: recebedor.nome,
    cidadeRecebedor: recebedor.cidade,
    txid,
  });
  const qr = qrDataUri(pixCopiaECola);

  db.prepare("INSERT INTO pix_pagamentos (agendamento_id, txid, checkout_token_hash, valor_total_centavos, valor_sinal_centavos, status, expira_em, pix_copia_e_cola, pix_qr_data_uri, provedor) VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, ?, 'manual')")
    .run(agendamentoId, txid, tokenHash(checkoutToken), valorTotal, valorSinal, expiraEm, pixCopiaECola, qr);
  db.prepare("UPDATE agendamentos SET pagamento_status='aguardando', pagamento_expira_em=? WHERE id=?")
    .run(expiraEm, agendamentoId);
  const pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(agendamentoId);
  return { pagamento: detalhesCheckout(pagamento, true), checkoutToken };
}

function expirarPagamento(pagamento) {
  if (!pagamento || pagamento.status !== 'aguardando' || pagamento.cliente_informou_em) return;
  db.prepare("UPDATE pix_pagamentos SET status='expirado', atualizado_em=datetime('now') WHERE id=? AND status='aguardando' AND cliente_informou_em IS NULL")
    .run(pagamento.id);
  db.prepare("UPDATE agendamentos SET status='cancelado', pagamento_status='expirado', atualizado_em=datetime('now') WHERE id=? AND pagamento_status='aguardando'")
    .run(pagamento.agendamento_id);
}

async function informarPagamento(req, res, agendamentoId) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('token');
  const pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(agendamentoId);
  if (!pagamento || pagamento.provedor !== 'manual' || !tokenConfere(token, pagamento.checkout_token_hash)) {
    return erro(res, 404, 'Checkout não encontrado.');
  }
  if (pagamento.status !== 'aguardando') return erro(res, 409, 'Este checkout não está aguardando pagamento.');
  if (Date.now() >= Date.parse(pagamento.expira_em)) {
    expirarPagamento(pagamento);
    return erro(res, 409, 'A reserva Pix expirou. Escolha outro horário para agendar.');
  }
  db.prepare("UPDATE pix_pagamentos SET cliente_informou_em=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND cliente_informou_em IS NULL")
    .run(pagamento.id);
  db.prepare('UPDATE agendamentos SET pagamento_expira_em=NULL, atualizado_em=datetime(\'now\') WHERE id=?')
    .run(agendamentoId);
  const atual = db.prepare('SELECT * FROM pix_pagamentos WHERE id=?').get(pagamento.id);
  json(res, 200, { ok: true, ...detalhesCheckout(atual) });
}

async function consultarPagamentoPublico(req, res, agendamentoId) {
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('token');
  let pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(agendamentoId);
  if (!pagamento || !tokenConfere(token, pagamento.checkout_token_hash)) return erro(res, 404, 'Checkout não encontrado.');
  if (pagamento.status === 'aguardando' && !pagamento.cliente_informou_em && Date.now() >= Date.parse(pagamento.expira_em)) {
    expirarPagamento(pagamento);
    pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE id=?').get(pagamento.id);
  }
  const ag = db.prepare('SELECT status FROM agendamentos WHERE id=?').get(agendamentoId);
  json(res, 200, { ...detalhesCheckout(pagamento), statusAgendamento: ag ? ag.status : 'cancelado' });
}

function expirarPendentes() {
  const expirados = db.prepare("SELECT * FROM pix_pagamentos WHERE status='aguardando' AND cliente_informou_em IS NULL AND julianday(expira_em)<=julianday('now') ORDER BY expira_em LIMIT 100").all();
  for (const pagamento of expirados) expirarPagamento(pagamento);
  return expirados.length;
}

function confirmarPagamentoManual(agendamentoId, usuarioId) {
  const pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(agendamentoId);
  if (!pagamento || pagamento.provedor !== 'manual') throw new Error('Pagamento Pix manual não encontrado.');
  if (pagamento.status === 'pago') return pagamento;
  if (pagamento.status !== 'aguardando' || !pagamento.cliente_informou_em) {
    throw new Error('A cliente ainda não informou o pagamento.');
  }
  const alterado = db.prepare("UPDATE pix_pagamentos SET status='pago', pago_em=datetime('now'), conferido_em=datetime('now'), conferido_por=?, atualizado_em=datetime('now') WHERE id=? AND status='aguardando' AND cliente_informou_em IS NOT NULL")
    .run(usuarioId || null, pagamento.id);
  if (!alterado.changes) throw new Error('O pagamento já foi conferido por outro usuário.');
  db.prepare("UPDATE agendamentos SET pagamento_status='pago', pagamento_expira_em=NULL, atualizado_em=datetime('now') WHERE id=?")
    .run(agendamentoId);
  registrarReceita(agendamentoId, pagamento.valor_sinal_centavos, 'Sinal Pix - ' + (pagamento.txid || ''), 'sinal');
  const ag = db.prepare("SELECT a.*, c.nome AS cliente, c.telefone, c.email, s.nome AS servico FROM agendamentos a JOIN clientes c ON c.id=a.cliente_id JOIN servicos s ON s.id=a.servico_id WHERE a.id=?")
    .get(agendamentoId);
  if (ag) {
    criarNotificacao(ag, 'confirmacao', 'email');
    criarNotificacao(ag, 'confirmacao', 'whatsapp');
  }
  return db.prepare('SELECT * FROM pix_pagamentos WHERE id=?').get(pagamento.id);
}

function registrarReceita(agendamentoId, valorCentavos, descricao, categoria) {
  if (!valorCentavos || valorCentavos <= 0) return;
  const marca = 'AGEND:' + agendamentoId + ':' + categoria;
  if (db.prepare('SELECT id FROM lancamentos_financeiros WHERE observacoes = ?').get(marca)) return;
  const ag = db.prepare('SELECT cliente_id FROM agendamentos WHERE id=?').get(agendamentoId);
  const hoje = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO lancamentos_financeiros
    (tipo, descricao, valor_centavos, vencimento, data_pagamento, status, cliente_id, categoria, observacoes)
    VALUES ('receber', ?, ?, ?, ?, 'realizado', ?, ?, ?)`)
    .run(descricao, Math.round(valorCentavos), hoje, hoje, ag ? ag.cliente_id : null, categoria, marca);
}

async function solicitarReembolso(pagamento, valorCentavos, observacao) {
  const valor = Math.max(0, Math.min(Number(valorCentavos), pagamento.valor_sinal_centavos));
  if (!valor) {
    db.prepare("UPDATE pix_pagamentos SET status='retido', atualizado_em=datetime('now') WHERE id=?").run(pagamento.id);
    db.prepare("UPDATE agendamentos SET pagamento_status='retido' WHERE id=?").run(pagamento.agendamento_id);
    return { valorCentavos: 0, status: 'sem_devolucao' };
  }
  const existente = db.prepare("SELECT * FROM pix_devolucoes WHERE pagamento_id=? AND manual=1 AND status='em_processamento' ORDER BY id DESC LIMIT 1").get(pagamento.id);
  if (existente) return { valorCentavos: existente.valor_centavos, status: 'manual_pendente' };

  const id = 'manual_' + crypto.randomBytes(12).toString('hex');
  db.prepare("INSERT INTO pix_devolucoes (pagamento_id, santander_id, end_to_end_id, valor_centavos, status, observacao, resposta, manual) VALUES (?, ?, ?, ?, 'em_processamento', ?, ?, 1)")
    .run(pagamento.id, id, 'MANUAL-' + pagamento.txid, valor, observacao || null,
      JSON.stringify({ tipo: 'devolucao_manual', instrucoes: 'Faça a devolução pelo aplicativo ou Internet Banking e depois marque como concluída no Agenda+.' }));
  db.prepare("UPDATE pix_pagamentos SET status='reembolso_pendente', atualizado_em=datetime('now') WHERE id=?").run(pagamento.id);
  db.prepare("UPDATE agendamentos SET pagamento_status='reembolso_pendente' WHERE id=?").run(pagamento.agendamento_id);
  return { valorCentavos: valor, status: 'manual_pendente' };
}

function listarDevolucoesManuais() {
  return db.prepare(`
    SELECT d.id, d.valor_centavos, d.observacao, d.criado_em,
           a.id AS agendamento_id, a.data, a.hora_inicio,
           c.nome AS cliente, s.nome AS servico
    FROM pix_devolucoes d
    JOIN pix_pagamentos pp ON pp.id=d.pagamento_id
    JOIN agendamentos a ON a.id=pp.agendamento_id
    JOIN clientes c ON c.id=a.cliente_id
    JOIN servicos s ON s.id=a.servico_id
    WHERE d.manual=1 AND d.status='em_processamento'
    ORDER BY d.criado_em ASC
  `).all();
}

function confirmarDevolucaoManual(id) {
  const devolucao = db.prepare("SELECT * FROM pix_devolucoes WHERE id=? AND manual=1 AND status='em_processamento'").get(id);
  if (!devolucao) throw new Error('Devolução manual pendente não encontrada.');
  db.prepare("UPDATE pix_devolucoes SET status='devolvido', resposta=?, atualizado_em=datetime('now') WHERE id=?")
    .run(JSON.stringify({ confirmadoManualmente: true, confirmadoEm: new Date().toISOString() }), id);
  const pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE id=?').get(devolucao.pagamento_id);
  const totalDevolvido = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) AS total FROM pix_devolucoes WHERE pagamento_id=? AND manual=1 AND status='devolvido'")
    .get(pagamento.id).total;
  const statusFinal = totalDevolvido >= pagamento.valor_sinal_centavos ? 'reembolsado' : 'reembolso_parcial';
  db.prepare("UPDATE pix_pagamentos SET status=?, atualizado_em=datetime('now') WHERE id=?").run(statusFinal, pagamento.id);
  db.prepare('UPDATE agendamentos SET pagamento_status=? WHERE id=?').run(statusFinal, pagamento.agendamento_id);
  return { ok: true, valorCentavos: devolucao.valor_centavos, status: statusFinal };
}

function cancelarPagamentoPendente(pagamento) {
  if (!pagamento || pagamento.status !== 'aguardando') return;
  db.prepare("UPDATE pix_pagamentos SET status='cancelado', atualizado_em=datetime('now') WHERE id=? AND status='aguardando'")
    .run(pagamento.id);
}

async function cancelarCliente(id, clienteId) {
  const ag = db.prepare('SELECT * FROM agendamentos WHERE id=? AND cliente_id=?').get(id, clienteId);
  if (!ag) return { erro: 'Agendamento não encontrado.' };
  if (!['pendente', 'confirmado'].includes(ag.status)) return { erro: 'Este agendamento não pode ser cancelado pelo portal.' };
  const inicio = Date.parse(ag.data + 'T' + ag.hora_inicio + ':00-03:00');
  if (!Number.isFinite(inicio) || inicio <= Date.now()) return { erro: 'O horário deste atendimento já começou ou passou.' };

  const pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(id);
  let retido = 0;
  let reembolso = { valorCentavos: 0, status: 'sem_devolucao' };
  if (pagamento && pagamento.status === 'pago') {
    const menosDeDuasHoras = inicio - Date.now() < 2 * 60 * 60 * 1000;
    retido = menosDeDuasHoras ? Math.round(pagamento.valor_total_centavos * 0.20) : 0;
    reembolso = await solicitarReembolso(pagamento, Math.max(0, pagamento.valor_sinal_centavos - retido),
      menosDeDuasHoras ? 'Cancelamento com menos de 2 horas' : 'Cancelamento com 2 horas ou mais');
  } else if (pagamento && pagamento.status === 'aguardando') {
    if (pagamento.cliente_informou_em) return { erro: 'A equipe está conferindo seu Pix. Aguarde a confirmação para solicitar o cancelamento.' };
    cancelarPagamentoPendente(pagamento);
    db.prepare("UPDATE agendamentos SET pagamento_status='cancelado' WHERE id=?").run(id);
  }

  db.prepare("UPDATE agendamentos SET status='cancelado', atualizado_em=datetime('now') WHERE id=?").run(id);
  return { ok: true, retidoCentavos: retido, reembolsoCentavos: reembolso.valorCentavos, statusReembolso: reembolso.status };
}

async function cancelarAdmin(id) {
  const pagamento = db.prepare('SELECT * FROM pix_pagamentos WHERE agendamento_id=?').get(id);
  if (!pagamento) return { ok: true };
  if (pagamento.status === 'pago') return solicitarReembolso(pagamento, pagamento.valor_sinal_centavos, 'Cancelamento pela clínica');
  if (pagamento.status === 'aguardando') {
    const verificarRecebimento = Boolean(pagamento.cliente_informou_em);
    cancelarPagamentoPendente(pagamento);
    db.prepare("UPDATE agendamentos SET pagamento_status='cancelado' WHERE id=?").run(id);
    return { ok: true, verificarRecebimento };
  }
  return { ok: true };
}

async function confirmarDevolucaoManualRota(req, res, id) {
  try { json(res, 200, confirmarDevolucaoManual(id)); }
  catch (e) { erro(res, 404, e.message); }
}

async function despachar(req, res, pathname) {
  const informar = pathname.match(/^\/api\/publico\/agendamentos\/(\d+)\/pagamento\/informar$/);
  if (informar) return informarPagamento(req, res, Number(informar[1]));
  const pagamento = pathname.match(/^\/api\/publico\/agendamentos\/(\d+)\/pagamento$/);
  if (pagamento && req.method === 'GET') return consultarPagamentoPublico(req, res, Number(pagamento[1]));
  const reembolso = pathname.match(/^\/api\/pagamentos\/devolucoes\/(\d+)\/confirmar$/);
  if (reembolso && req.method === 'POST') return confirmarDevolucaoManualRota(req, res, Number(reembolso[1]));
  return erro(res, 404, 'Rota de pagamento não encontrada.');
}

module.exports = {
  criarPagamento, consultarPagamentoPublico, expirarPendentes, informarPagamento,
  confirmarPagamentoManual, listarDevolucoesManuais, confirmarDevolucaoManual,
  cancelarCliente, cancelarAdmin, solicitarReembolso, despachar, registrarReceita,
};