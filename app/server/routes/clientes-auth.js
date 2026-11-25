'use strict';

const { db, hashSenha, verificarSenha } = require('../db/database');
const {
  json, erro, lerCorpo, exigirCampos, validarEmail,
  criarSessaoCliente, removerSessaoCliente, clienteDaRequisicao,
} = require('../core');

const pagamentosPix = require('../pagamentos');

function perfilCliente(cliente) {
  return { id: cliente.id, nome: cliente.nome, email: cliente.email, telefone: cliente.telefone, data_nascimento: cliente.data_nascimento };
}
function telefoneNormalizado(valor) { return String(valor || '').replace(/\D/g, ''); }

async function registrar(req, res) {
  const corpo = await lerCorpo(req);
  exigirCampos(corpo, ['nome', 'email', 'telefone', 'senha']);
  if (!validarEmail(corpo.email)) return erro(res, 400, 'E-mail inválido.');
  if (String(corpo.senha).length < 8) return erro(res, 400, 'A senha precisa ter ao menos 8 caracteres.');
  if (telefoneNormalizado(corpo.telefone).length < 10) return erro(res, 400, 'Informe um telefone válido.');

  const email = String(corpo.email).trim().toLowerCase();
  if (db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(email)) return erro(res, 409, 'Este e-mail já está associado a uma conta da equipe.');
  const encontrados = db.prepare('SELECT * FROM clientes WHERE lower(email) = ? AND ativo = 1 ORDER BY id').all(email);
  if (encontrados.length > 1) return erro(res, 409, 'Há mais de um cadastro com este e-mail. Peça à clínica para revisar seus dados.');
  let id;
  if (encontrados.length === 1) {
    const existente = encontrados[0];
    if (existente.senha_hash) return erro(res, 409, 'Este e-mail já possui uma conta. Entre com seu acesso de cliente.');
    if (!existente.telefone || telefoneNormalizado(existente.telefone) !== telefoneNormalizado(corpo.telefone)) {
      return erro(res, 409, 'O cadastro já existe. Para vincular o acesso, confirme seu telefone com a clínica.');
    }
    db.prepare("UPDATE clientes SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?")
      .run(hashSenha(corpo.senha), existente.id);
    id = existente.id;
  } else {
    const result = db.prepare('INSERT INTO clientes (nome, telefone, email, data_nascimento, senha_hash) VALUES (?, ?, ?, ?, ?)')
      .run(String(corpo.nome).trim(), String(corpo.telefone).trim(), email, corpo.data_nascimento || null, hashSenha(corpo.senha));
    id = result.lastInsertRowid;
  }
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  const token = criarSessaoCliente(id);
  json(res, 201, { token, cliente: perfilCliente(cliente) });
}

async function login(req, res) {
  const corpo = await lerCorpo(req);
  exigirCampos(corpo, ['email', 'senha']);
  if (!validarEmail(corpo.email)) return erro(res, 400, 'E-mail inválido.');
  const lista = db.prepare('SELECT * FROM clientes WHERE lower(email) = ? AND ativo = 1').all(String(corpo.email).trim().toLowerCase());
  if (lista.length !== 1 || !lista[0].senha_hash || !verificarSenha(corpo.senha, lista[0].senha_hash)) {
    return erro(res, 401, 'E-mail ou senha de cliente incorretos.');
  }
  json(res, 200, { token: criarSessaoCliente(lista[0].id), cliente: perfilCliente(lista[0]) });
}

async function atual(req, res) {
  const cliente = clienteDaRequisicao(req);
  if (!cliente) return erro(res, 401, 'Acesso de cliente expirado.');
  json(res, 200, perfilCliente(cliente));
}

async function agendamentos(req, res) {
  const cliente = clienteDaRequisicao(req);
  if (!cliente) return erro(res, 401, 'Acesso de cliente expirado.');
  const rows = db.prepare('SELECT a.id, a.data, a.hora_inicio, a.hora_fim, a.status, a.origem, a.pagamento_status, s.nome AS servico, s.preco_centavos, p.nome AS profissional, pp.status AS pix_status, pp.valor_sinal_centavos, pp.pix_copia_e_cola, pp.expira_em AS pix_expira_em ' +
    'FROM agendamentos a JOIN servicos s ON s.id = a.servico_id JOIN profissionais p ON p.id = a.profissional_id ' +
    'LEFT JOIN pix_pagamentos pp ON pp.agendamento_id = a.id ' +
    'WHERE a.cliente_id = ? ORDER BY a.data DESC, a.hora_inicio DESC LIMIT 100').all(cliente.id);
  json(res, 200, rows);
}

async function cancelar(req, res, id) {
  const cliente = clienteDaRequisicao(req);
  if (!cliente) return erro(res, 401, 'Acesso de cliente expirado.');
  const resultado = await pagamentosPix.cancelarCliente(id, cliente.id);
  if (resultado.erro) return erro(res, 409, resultado.erro);
  json(res, 200, resultado);
}

async function logout(req, res) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) removerSessaoCliente(auth.slice(7));
  json(res, 200, { ok: true });
}

async function despachar(req, res, pathname) {
  const metodo = req.method;
  if (pathname === '/api/cliente/registrar' && metodo === 'POST') return registrar(req, res);
  if (pathname === '/api/cliente/login' && metodo === 'POST') return login(req, res);
  if (pathname === '/api/cliente/logout' && metodo === 'POST') return logout(req, res);
  if (pathname === '/api/cliente/atual' && metodo === 'GET') return atual(req, res);
  if (pathname === '/api/cliente/agendamentos' && metodo === 'GET') return agendamentos(req, res);
  const m = pathname.match(/^\/api\/cliente\/agendamentos\/(\d+)\/cancelar$/);
  if (m && metodo === 'POST') return cancelar(req, res, Number(m[1]));
  return erro(res, 404, 'Rota de cliente não encontrada.');
}

module.exports = { despachar };