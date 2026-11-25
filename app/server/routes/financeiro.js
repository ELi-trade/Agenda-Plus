'use strict';

const { db } = require('../db/database');
const { json, erro, lerCorpo, exigirCampos, validarData } = require('../core');

const TIPOS = ['receber', 'pagar'];
const STATUS = ['previsto', 'nao_pago', 'realizado', 'cancelado'];

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function total(tipo, status, de, ate, operador = 'BETWEEN') {
  const marks = status.map(() => '?').join(', ');
  const sql = operador === '<' || operador === '='
    ? 'SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM lancamentos_financeiros WHERE tipo = ? AND status IN (' + marks + ') AND vencimento ' + operador + ' ?'
    : 'SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM lancamentos_financeiros WHERE tipo = ? AND status IN (' + marks + ') AND vencimento BETWEEN ? AND ?';
  const args = operador === '<' || operador === '=' ? [tipo, ...status, de] : [tipo, ...status, de, ate];
  return db.prepare(sql).get(...args).total;
}

function montarFluxo(de, ate, statuses, usarDataPagamento) {
  const campoData = usarDataPagamento ? 'COALESCE(data_pagamento, vencimento)' : 'vencimento';
  const marks = statuses.map(() => '?').join(', ');
  const rows = db.prepare(
    'SELECT ' + campoData + ' AS data, ' +
    "SUM(CASE WHEN tipo = 'receber' THEN valor_centavos ELSE 0 END) AS receitas, " +
    "SUM(CASE WHEN tipo = 'pagar' THEN valor_centavos ELSE 0 END) AS despesas " +
    'FROM lancamentos_financeiros WHERE status IN (' + marks + ') AND ' + campoData + ' BETWEEN ? AND ? GROUP BY data'
  ).all(...statuses, de, ate);
  const porData = new Map(rows.map((r) => [r.data, r]));
  const [ano, mes, dia] = de.split('-').map(Number);
  const [anoFim, mesFim, diaFim] = ate.split('-').map(Number);
  const atual = new Date(Date.UTC(ano, mes - 1, dia));
  const fim = new Date(Date.UTC(anoFim, mesFim - 1, diaFim));
  const resultado = [];
  while (atual <= fim) {
    const data = atual.toISOString().slice(0, 10);
    const row = porData.get(data) || { receitas: 0, despesas: 0 };
    resultado.push({ data, receitas_centavos: row.receitas, despesas_centavos: row.despesas, saldo_centavos: row.receitas - row.despesas });
    atual.setUTCDate(atual.getUTCDate() + 1);
  }
  return resultado;
}

function resumoFinanceiro(de, ate, hoje = hojeISO()) {
  const abertos = ['previsto', 'nao_pago'];
  const estados = ['previsto', 'nao_pago', 'realizado'];
  const contas = estados.map((status) => {
    const receber = total('receber', [status], de, ate);
    const pagar = total('pagar', [status], de, ate);
    return { status, receber_centavos: receber, pagar_centavos: pagar, saldo_centavos: receber - pagar };
  });
  return {
    receber_hoje_centavos: total('receber', abertos, hoje, hoje, '='),
    pagar_hoje_centavos: total('pagar', abertos, hoje, hoje, '='),
    receber_vencido_centavos: total('receber', abertos, hoje, null, '<'),
    pagar_vencido_centavos: total('pagar', abertos, hoje, null, '<'),
    contas,
    fluxo: {
      realizado: montarFluxo(de, ate, ['realizado'], true),
      previsto: montarFluxo(de, ate, abertos, false),
    },
  };
}

async function listar(req, res) {
  const url = new URL(req.url, 'http://x');
  const tipo = url.searchParams.get('tipo');
  const status = url.searchParams.get('status');
  const condicoes = [];
  const parametros = [];
  if (tipo) {
    if (!TIPOS.includes(tipo)) return erro(res, 400, 'Tipo financeiro invalido');
    condicoes.push('f.tipo = ?'); parametros.push(tipo);
  }
  if (status === 'vencido') {
    condicoes.push("f.status IN ('previsto','nao_pago') AND f.vencimento < ?");
    parametros.push(hojeISO());
  } else if (status) {
    if (!STATUS.includes(status)) return erro(res, 400, 'Status financeiro invalido');
    condicoes.push('f.status = ?'); parametros.push(status);
  }
  const where = condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : '';
  const rows = db.prepare(
    'SELECT f.*, c.nome AS cliente FROM lancamentos_financeiros f LEFT JOIN clientes c ON c.id = f.cliente_id ' +
    where + ' ORDER BY f.vencimento DESC, f.id DESC LIMIT 500'
  ).all(...parametros);
  json(res, 200, rows);
}

function validarLancamento(c) {
  if (!TIPOS.includes(c.tipo)) return 'Escolha receber ou pagar';
  if (!String(c.descricao || '').trim()) return 'Informe a descricao';
  if (!validarData(c.vencimento)) return 'Data de vencimento invalida';
  const valor = Number(String(c.valor ?? '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100000000) return 'Informe um valor maior que zero';
  if (c.status && !STATUS.includes(c.status)) return 'Status financeiro invalido';
  if (c.data_pagamento && !validarData(c.data_pagamento)) return 'Data de pagamento invalida';
  if (c.cliente_id && !db.prepare('SELECT id FROM clientes WHERE id = ? AND ativo = 1').get(Number(c.cliente_id))) return 'Cliente nao encontrado';
  return null;
}

async function salvar(req, res, _usuario, id = null) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['tipo', 'descricao', 'valor', 'vencimento']);
  const problema = validarLancamento(c);
  if (problema) return erro(res, 400, problema);
  const status = c.status || 'previsto';
  const dataPagamento = status === 'realizado' ? (c.data_pagamento || hojeISO()) : null;
  const dados = [c.tipo, String(c.descricao).trim(), Math.round(Number(String(c.valor).replace(',', '.')) * 100), c.vencimento,
    dataPagamento, status, c.cliente_id ? Number(c.cliente_id) : null, String(c.categoria || '').trim() || null,
    String(c.observacoes || '').trim() || null];
  if (id) {
    if (!db.prepare('SELECT id FROM lancamentos_financeiros WHERE id = ?').get(id)) return erro(res, 404, 'Lancamento nao encontrado');
    db.prepare('UPDATE lancamentos_financeiros SET tipo=?, descricao=?, valor_centavos=?, vencimento=?, data_pagamento=?, status=?, cliente_id=?, categoria=?, observacoes=?, atualizado_em=datetime(\'now\') WHERE id=?')
      .run(...dados, id);
    return json(res, 200, { id: Number(id) });
  }
  const info = db.prepare('INSERT INTO lancamentos_financeiros (tipo, descricao, valor_centavos, vencimento, data_pagamento, status, cliente_id, categoria, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(...dados);
  json(res, 201, { id: info.lastInsertRowid });
}

async function alterarStatus(req, res, _usuario, id) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['status']);
  if (!STATUS.includes(c.status)) return erro(res, 400, 'Status financeiro invalido');
  const atual = db.prepare('SELECT id FROM lancamentos_financeiros WHERE id = ?').get(id);
  if (!atual) return erro(res, 404, 'Lancamento nao encontrado');
  const dataPagamento = c.status === 'realizado' ? (validarData(c.data_pagamento) ? c.data_pagamento : hojeISO()) : null;
  db.prepare('UPDATE lancamentos_financeiros SET status=?, data_pagamento=?, atualizado_em=datetime(\'now\') WHERE id=?')
    .run(c.status, dataPagamento, id);
  json(res, 200, { ok: true, status: c.status });
}

async function excluir(_req, res, _usuario, id) {
  const resultado = db.prepare('DELETE FROM lancamentos_financeiros WHERE id = ?').run(id);
  if (!resultado.changes) return erro(res, 404, 'Lancamento nao encontrado');
  json(res, 200, { ok: true });
}

async function resumo(req, res) {
  const url = new URL(req.url, 'http://x');
  const hoje = hojeISO();
  const mes = url.searchParams.get('mes');
  const selecionado = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '') ? mes : hoje.slice(0, 7);
  const [ano, numeroMes] = selecionado.split('-').map(Number);
  const de = selecionado + '-01';
  const ate = new Date(Date.UTC(ano, numeroMes, 0)).toISOString().slice(0, 10);
  json(res, 200, resumoFinanceiro(de, ate, hoje));
}

module.exports = { listar, salvar, alterarStatus, excluir, resumo, resumoFinanceiro };