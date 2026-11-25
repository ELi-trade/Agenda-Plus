'use strict';
// Utilidades centrais do servidor HTTP (sem dependências externas)

const { db } = require('./db/database');

const PREFIXO_SESSAO = 'sess_';

function json(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(corpo);
}

function erro(res, status, mensagem) {
  json(res, status, { erro: mensagem });
}

function lerCorpo(req, limite = 1 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > limite) { reject(new Error('Corpo da requisição muito grande')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// ---------- Sessões ----------
function criarSessao(usuarioId) {
  const token = PREFIXO_SESSAO + crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)')
    .run(token, usuarioId, expira);
  return token;
}

function removerSessao(token) {
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

function criarSessaoCliente(clienteId) {
  const token = 'cli_' + crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessoes_clientes (token, cliente_id, expira_em) VALUES (?, ?, ?)').run(token, clienteId, expira);
  return token;
}

function removerSessaoCliente(token) {
  db.prepare('DELETE FROM sessoes_clientes WHERE token = ?').run(token);
}

function clienteDaRequisicao(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return db.prepare('SELECT c.id, c.nome, c.email, c.telefone, c.data_nascimento, c.ativo ' +
    'FROM sessoes_clientes s JOIN clientes c ON c.id = s.cliente_id ' +
    "WHERE s.token = ? AND s.expira_em > datetime('now') AND c.ativo = 1").get(token) || null;
}

function usuarioDaRequisicao(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.profissional_id, s.token
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ? AND s.expira_em > datetime('now') AND u.ativo = 1
  `).get(token);
  return row || null;
}

// ---------- Autorização ----------
const PERMISSOES = {
  admin: ['*'],
  gestor: ['cadastros', 'agenda', 'dashboard', 'financeiro', 'relatorios', 'configuracoes'],
  recepcao: ['agenda', 'dashboard', 'cadastros:ler', 'cadastros:escrever'],
  profissional: ['agenda', 'dashboard', 'agenda:propria', 'cadastros:ler'],
};

function temPermissao(usuario, acao) {
  if (!usuario) return false;
  const perms = PERMISSOES[usuario.perfil] || [];
  if (perms.includes('*') || perms.includes(acao)) return true;
  // 'cadastros' concede leitura; escrita exige 'cadastros:escrever'
  if (acao === 'cadastros:ler' && perms.includes('cadastros')) return true;
  return false;
}

function exigeAuth(acao) {
  return (req, res, usuario) => {
    if (!usuario) { erro(res, 401, 'Não autenticado'); return false; }
    if (acao && !temPermissao(usuario, acao)) { erro(res, 403, 'Sem permissão'); return false; }
    return true;
  };
}

const crypto = require('node:crypto');

// ---------- Validação ----------
function exigirCampos(obj, campos) {
  const faltando = campos.filter((c) => obj[c] === undefined || obj[c] === null || obj[c] === '');
  if (faltando.length) throw new ValidationError(`Campos obrigatórios ausentes: ${faltando.join(', ')}`);
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function validarData(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) && !isNaN(Date.parse(data));
}

function validarHora(hora) {
  return /^\d{2}:\d{2}$/.test(String(hora || ''));
}

class ValidationError extends Error {
  constructor(msg) { super(msg); this.status = 400; }
}

module.exports = {
  json, erro, lerCorpo,
  criarSessao, removerSessao, usuarioDaRequisicao,
  criarSessaoCliente, removerSessaoCliente, clienteDaRequisicao,
  temPermissao, exigeAuth,
  exigirCampos, validarEmail, validarData, validarHora,
  ValidationError,
};
