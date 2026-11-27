const fs = require('fs');

// ---- AUTH.JS: adicionar excluirUsuario ----
let auth = fs.readFileSync('app/server/routes/auth.js', 'utf8');
if (!auth.includes('excluirUsuario')) {
  const fn = [
    'async function excluirUsuario(req, res, usuario, id) {',
    "  if (usuario.perfil !== 'admin') return erro(res, 403, 'Apenas administradores podem excluir usuários');",
    '  const uid = Number(id);',
    '  if (uid === usuario.id) return erro(res, 400, "Você não pode excluir a si mesmo");',
    "  const alvo = db.prepare('SELECT id, nome, perfil FROM usuarios WHERE id = ?').get(uid);",
    "  if (!alvo) return erro(res, 404, 'Usuário não encontrado');",
    "  if (alvo.perfil === 'admin') return erro(res, 400, 'Não é possível excluir outro administrador');",
    "  const sessoes = db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ?').get(uid).n;",
    "  if (sessoes > 0) return erro(res, 409, 'Este usuário possui sessões ativas. Faça logout dele primeiro');",
    "  db.prepare('DELETE FROM usuarios WHERE id = ?').run(uid);",
    '  json(res, 200, { ok: true });',
    '}'
  ].join('\n');
  auth = auth.replace('module.exports = {', fn + '\n\nmodule.exports = {');
  auth = auth.replace('listarUsuarios, salvarUsuario };', 'listarUsuarios, salvarUsuario, excluirUsuario };');
  fs.writeFileSync('app/server/routes/auth.js', auth, 'utf8');
  console.log('✓ auth.js: excluirUsuario adicionado');
}

// ---- CADASTROS.JS: adicionar inativarCliente ----
let cad = fs.readFileSync('app/server/routes/cadastros.js', 'utf8');
if (!cad.includes('inativarCliente')) {
  const novo = [
    'async function inativarCliente(req, res, _u, id) {',
    "  db.prepare(\"UPDATE clientes SET ativo = 0, atualizado_em = datetime('now') WHERE id = ?\").run(id);",
    '  json(res, 200, { ok: true });',
    '}'
  ].join('\n');
  cad = cad.replace("json(res, 200, { ok: true });\n}", "json(res, 200, { ok: true });\n}\n\n" + novo);
  cad = cad.replace('excluirCliente,', 'excluirCliente, inativarCliente,');
  fs.writeFileSync('app/server/routes/cadastros.js', cad, 'utf8');
  console.log('✓ cadastros.js: inativarCliente adicionado');
}

// ---- SERVER.JS: rota DELETE para usuários ----
let srv = fs.readFileSync('app/server/server.js', 'utf8');
if (!srv.includes('auth.excluirUsuario')) {
  srv = srv.replace(
    "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);",
    "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);\n    if (metodo === 'DELETE' && id) return auth.excluirUsuario(req, res, usuario, id);"
  );
  fs.writeFileSync('app/server/server.js', srv, 'utf8');
  console.log('✓ server.js: rota DELETE /api/usuarios/:id adicionada');
}
