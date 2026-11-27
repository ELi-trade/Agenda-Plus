const fs = require('fs');
let a = fs.readFileSync('app/server/routes/auth.js', 'utf8');
if (a.includes('excluirUsuario')) { console.log('ja existe'); process.exit(); }
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
  "  const devolucoes = db.prepare('SELECT COUNT(*) AS n FROM pix_devolucoes WHERE conferido_por = ?').get(uid).n;",
  "  if (devolucoes > 0) return erro(res, 409, 'Este usuário possui devoluções registradas. Não pode ser excluído');",
  "  db.prepare('DELETE FROM usuarios WHERE id = ?').run(uid);",
  '  json(res, 200, { ok: true });',
  '}'
].join('\n');
a = a.replace('module.exports = {', fn + '\n\nmodule.exports = {');
a = a.replace('listarUsuarios, salvarUsuario };', 'listarUsuarios, salvarUsuario, excluirUsuario };');
fs.writeFileSync('app/server/routes/auth.js', a, 'utf8');
console.log('auth.js OK');
