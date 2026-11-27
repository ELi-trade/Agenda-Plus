'use strict';
// Rotas de autenticação e usuários

const crypto = require('node:crypto');
const { db, hashSenha, verificarSenha } = require('../db/database');
const {
  json, erro, lerCorpo, criarSessao, removerSessao, criarSessaoCliente,
  exigirCampos, validarEmail, ValidationError,
} = require('../core');

async function login(req, res) {
  const corpo = await lerCorpo(req);
  exigirCampos(corpo, ['email', 'senha']);
  if (!validarEmail(corpo.email)) return erro(res, 400, 'E-mail inválido');
  const email = String(corpo.email).toLowerCase().trim();

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (usuario) {
    if (!verificarSenha(corpo.senha, usuario.senha_hash)) return erro(res, 401, 'E-mail ou senha incorretos');
    if (!usuario.ativo) return erro(res, 403, 'Usuário desativado');
    const token = criarSessao(usuario.id);
    return json(res, 200, {
      tipo: 'equipe',
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, profissionalId: usuario.profissional_id },
    });
  }

  const clientes = db.prepare('SELECT * FROM clientes WHERE lower(email) = ? AND ativo = 1').all(email)
    .filter((cliente) => cliente.senha_hash && verificarSenha(corpo.senha, cliente.senha_hash));
  if (clientes.length !== 1) return erro(res, 401, 'E-mail ou senha incorretos');
  const cliente = clientes[0];
  const token = criarSessaoCliente(cliente.id);
  json(res, 200, {
    tipo: 'cliente',
    token,
    cliente: { id: cliente.id, nome: cliente.nome, email: cliente.email, telefone: cliente.telefone, data_nascimento: cliente.data_nascimento },
  });
}
async function logout(req, res) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) removerSessao(token);
  json(res, 200, { ok: true });
}

async function registrar(req, res) {
  const corpo = await lerCorpo(req);
  exigirCampos(corpo, ['nome', 'email', 'senha']);
  if (!validarEmail(corpo.email)) return erro(res, 400, 'E-mail inválido');
  if (String(corpo.senha).length < 8) return erro(res, 400, 'A senha deve ter ao menos 8 caracteres');

  const email = String(corpo.email).toLowerCase().trim();
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) return erro(res, 409, 'Já existe um usuário com este e-mail');

  // O primeiro usuário criado torna-se admin; os demais, gestor.
  const total = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  const perfil = total === 0 ? 'admin' : 'gestor';

  const info = db.prepare('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)')
    .run(String(corpo.nome).trim(), email, hashSenha(corpo.senha), perfil);

  const token = criarSessao(info.lastInsertRowid);
  json(res, 201, {
    token,
    usuario: { id: info.lastInsertRowid, nome: corpo.nome, email, perfil },
  });
}

async function recuperarSolicitacao(req, res) {
  const corpo = await lerCorpo(req);
  exigirCampos(corpo, ['email']);
  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1')
    .get(String(corpo.email).toLowerCase().trim());

  // Resposta genérica por segurança (não revela se o e-mail existe)
  if (usuario) {
    const token = crypto.randomBytes(24).toString('hex');
    const expira = new Date(Date.now() + 3600 * 1000).toISOString();
    db.prepare('INSERT INTO tokens_recuperacao (token, usuario_id, expira_em) VALUES (?, ?, ?)')
      .run(token, usuario.id, expira);
    console.log(`[recuperacao] Token para ${usuario.email}: ${token} ( válido por 1h — entregue via log pois o envio de e-mail não está configurado )`);
  }
  json(res, 200, { ok: true, mensagem: 'Se o e-mail existir, as instruções de recuperação foram geradas.' });
}

async function recuperarConfirmar(req, res) {
  const corpo = await lerCorpo(req);
  exigirCampos(corpo, ['token', 'senha']);
  if (String(corpo.senha).length < 8) return erro(res, 400, 'A senha deve ter ao menos 8 caracteres');

  const reg = db.prepare(`
    SELECT * FROM tokens_recuperacao
    WHERE token = ? AND usado = 0 AND expira_em > datetime('now')
  `).get(corpo.token);
  if (!reg) return erro(res, 400, 'Token de recuperação inválido ou expirado');

  db.prepare('UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime(\'now\') WHERE id = ?')
    .run(hashSenha(corpo.senha), reg.usuario_id);
  db.prepare('UPDATE tokens_recuperacao SET usado = 1 WHERE token = ?').run(corpo.token);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(reg.usuario_id);
  json(res, 200, { ok: true });
}

async function listarUsuarios(req, res, usuario) {
  if (usuario.perfil !== 'admin' && usuario.perfil !== 'gestor') return erro(res, 403, 'Sem permissão');
  const rows = db.prepare(`
    SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.profissional_id, p.nome AS profissional
    FROM usuarios u LEFT JOIN profissionais p ON p.id = u.profissional_id
    ORDER BY u.nome
  `).all();
  json(res, 200, rows);
}

async function salvarUsuario(req, res, usuario) {
  if (usuario.perfil !== 'admin') return erro(res, 403, 'Apenas administradores podem gerenciar usuários');
  const corpo = await lerCorpo(req);

  if (corpo.id) {
    const atual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(corpo.id);
    if (!atual) return erro(res, 404, 'Usuário não encontrado');
    if (corpo.senha) {
      if (String(corpo.senha).length < 8) return erro(res, 400, 'A senha deve ter ao menos 8 caracteres');
      db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(corpo.senha), corpo.id);
    }
    db.prepare(`UPDATE usuarios SET nome = ?, email = ?, perfil = ?, ativo = ?, profissional_id = ?,
                atualizado_em = datetime('now') WHERE id = ?`)
      .run(corpo.nome ?? atual.nome, corpo.email ?? atual.email, corpo.perfil ?? atual.perfil,
        corpo.ativo ? 1 : 0, corpo.profissionalId ?? null, corpo.id);
    return json(res, 200, { ok: true });
  }

  exigirCampos(corpo, ['nome', 'email', 'senha', 'perfil']);
  if (!validarEmail(corpo.email)) return erro(res, 400, 'E-mail inválido');
  if (String(corpo.senha).length < 8) return erro(res, 400, 'A senha deve ter ao menos 8 caracteres');
  if (!['admin', 'gestor', 'profissional', 'recepcao'].includes(corpo.perfil)) return erro(res, 400, 'Perfil inválido');

  const email = String(corpo.email).toLowerCase().trim();
  if (db.prepare('SELECT id FROM clientes WHERE lower(email) = ? AND senha_hash IS NOT NULL').get(email)) return erro(res, 409, 'Este e-mail já está associado a uma conta de cliente.');
  if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)) {
    return erro(res, 409, 'Já existe um usuário com este e-mail');
  }
  const info = db.prepare('INSERT INTO usuarios (nome, email, senha_hash, perfil, profissional_id) VALUES (?, ?, ?, ?, ?)')
    .run(String(corpo.nome).trim(), email, hashSenha(corpo.senha), corpo.perfil, corpo.profissionalId ?? null);
  json(res, 201, { id: info.lastInsertRowid });
}

async function excluirUsuario(req, res, usuario, id) {
  if (usuario.perfil !== 'admin') return erro(res, 403, 'Apenas administradores podem excluir usuários');
  const uid = Number(id);
  if (uid === usuario.id) return erro(res, 400, "Você não pode excluir a si mesmo");
  const alvo = db.prepare('SELECT id, nome, perfil FROM usuarios WHERE id = ?').get(uid);
  if (!alvo) return erro(res, 404, 'Usuário não encontrado');
  if (alvo.perfil === 'admin') return erro(res, 400, 'Não é possível excluir outro administrador');
  const sessoes = db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ?').get(uid).n;
  if (sessoes > 0) return erro(res, 409, 'Este usuário possui sessões ativas. Faça logout dele primeiro');
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(uid);
  json(res, 200, { ok: true });
}

module.exports = { login, logout, registrar, recuperarSolicitacao, recuperarConfirmar, listarUsuarios, salvarUsuario, excluirUsuario };
