const fs = require('fs');
const log = (t,ok)=>console.log((ok?'✓ ':'✗ ')+t);

// ---- P1: auth.js ----
let a = fs.readFileSync('app/server/routes/auth.js','utf8');
if (!a.includes('excluirUsuario')) {
  const fn = [
    "async function excluirUsuario(req, res, usuario, id) {",
    "  if (usuario.perfil !== 'admin') return erro(res, 403, 'Apenas administradores podem excluir usuários');",
    "  const uid = Number(id);",
    "  if (uid === usuario.id) return erro(res, 400, 'Você não pode excluir a si mesmo');",
    "  const alvo = db.prepare('SELECT id, nome, perfil FROM usuarios WHERE id = ?').get(uid);",
    "  if (!alvo) return erro(res, 404, 'Usuário não encontrado');",
    "  if (alvo.perfil === 'admin') return erro(res, 400, 'Não é possível excluir outro administrador');",
    "  const sessoes = db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ?').get(uid).n;",
    "  if (sessoes > 0) return erro(res, 409, 'Este usuário possui sessões ativas. Faça logout dele primeiro');",
    "  const dev = db.prepare('SELECT COUNT(*) AS n FROM pix_devolucoes WHERE conferido_por = ?').get(uid).n;",
    "  if (dev > 0) return erro(res, 409, 'Este usuário possui devoluções registradas. Não pode ser excluído');",
    "  db.prepare('DELETE FROM usuarios WHERE id = ?').run(uid);",
    "  json(res, 200, { ok: true });",
    "}"
  ].join('\n');
  a = a.replace('module.exports = {', fn + '\n\nmodule.exports = {');
  a = a.replace('listarUsuarios, salvarUsuario };', 'listarUsuarios, salvarUsuario, excluirUsuario };');
  fs.writeFileSync('app/server/routes/auth.js', a, 'utf8');
}
log('P1 auth.js', fs.readFileSync('app/server/routes/auth.js','utf8').includes('excluirUsuario'));

// ---- P2: cadastros.js ----
let c = fs.readFileSync('app/server/routes/cadastros.js','utf8');
if (!c.includes('inativarCliente')) {
  const novo = [
    "async function excluirCliente(req, res, _u, id) {",
    "  const uid = Number(id);",
    "  const ags = db.prepare('SELECT COUNT(*) AS n FROM agendamentos WHERE cliente_id = ?').get(uid).n;",
    "  if (ags > 0) return erro(res, 409, 'Este cliente possui ' + ags + ' agendamento(s). Use Inativar.');",
    "  db.prepare('DELETE FROM clientes WHERE id = ?').run(uid);",
    "  json(res, 200, { ok: true });",
    "}",
    "async function inativarCliente(req, res, _u, id) {",
    "  db.prepare(\"UPDATE clientes SET ativo = 0, atualizado_em = datetime('now') WHERE id = ?\").run(id);",
    "  json(res, 200, { ok: true });",
    "}"
  ].join('\n');
  c = c.replace(/async function excluirCliente[\s\S]*?\n\}/, novo);
  c = c.replace('excluirCliente,', 'excluirCliente, inativarCliente,');
  fs.writeFileSync('app/server/routes/cadastros.js', c, 'utf8');
}
log('P2 cadastros.js', fs.readFileSync('app/server/routes/cadastros.js','utf8').includes('inativarCliente'));

// ---- P3: server.js ----
let s = fs.readFileSync('app/server/server.js','utf8');
if (!s.includes('auth.excluirUsuario')) {
  s = s.replace(
    "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);",
    "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);\n    if (metodo === 'DELETE' && id) return auth.excluirUsuario(req, res, usuario, id);"
  );
  fs.writeFileSync('app/server/server.js', s, 'utf8');
}
log('P3 server.js', fs.readFileSync('app/server/server.js','utf8').includes('auth.excluirUsuario'));

// ---- P4: app.js ----
let p = fs.readFileSync('app/public/js/app.js','utf8');
const hasUsu = p.includes('data-excluir-usuario');
const hasCli = p.includes('data-excluir-definitivo');
if (!hasUsu) {
  const re = /<td>\$\{u\.ativo \? '<span class="tag st-confirmado">Ativo<\/span>' : '<span class="tag st-cancelado">Inativo<\/span>'\}<\/td>/;
  if (re.test(p)) {
    p = p.replace(re, '<td>${u.ativo ? \'<span class="tag st-confirmado">Ativo</span>\' : \'<span class="tag st-cancelado">Inativo</span>\'}</td><td><button class="btn mini btn-sec" data-editar-usuario="${u.id}">Editar</button> <button class="btn mini btn-perigo" data-excluir-usuario="${u.id}">Excluir</button></td>');
  } else console.log('  ! P4a regex usuarios nao bateu');
}
if (!hasCli) {
  const re2 = /<button class="btn mini btn-sec" data-excluir="\$\{c\.id\}">Inativar<\/button>/;
  if (re2.test(p)) {
    p = p.replace(re2, '<button class="btn mini btn-perigo" data-excluir-definitivo="${c.id}">Excluir</button> <button class="btn mini btn-sec" data-excluir="${c.id}">Inativar</button>');
  } else console.log('  ! P4b regex clientes nao bateu');
}
if (!p.includes("data-excluir-usuario']").forEach) {
  p = p.replace("$('#btn-novo').onclick = () => {",
    "  $$('#tab-usu [data-excluir-usuario]').forEach((b) => b.onclick = async () => { if (!confirmar('Excluir este usuario permanentemente?')) return; await withLoading(async () => { try { await del('/api/usuarios/' + b.dataset.excluirUsuario); toast('Usuario excluido','ok'); location.reload(); } catch(e){ toast(e.message||'Erro','erro'); } }); });\n  $('#btn-novo').onclick = () => {");
}
if (!p.includes("data-excluir-definitivo']").forEach) {
  p = p.replace("$$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {",
    "    $$('#tab-cli [data-excluir-definitivo]').forEach((b) => b.onclick = async () => { if (!confirmar('Excluir este cliente PERMANENTEMENTE?')) return; await withLoading(async () => { try { await del('/api/clientes/' + b.dataset.excluirDefinitivo); toast('Cliente excluido','ok'); carregar(busca); } catch(e){ toast(e.message||'Erro','erro'); } }); });\n    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {");
}
fs.writeFileSync('app/public/js/app.js', p, 'utf8');
log('P4 app.js usuarios', fs.readFileSync('app/public/js/app.js','utf8').includes('data-excluir-usuario'));
log('P4 app.js clientes', fs.readFileSync('app/public/js/app.js','utf8').includes('data-excluir-definitivo'));
console.log('\nFIM');
