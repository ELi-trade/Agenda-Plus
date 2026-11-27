const fs = require('fs');

// ==================== PATCH 1: auth.js — adicionar excluirUsuario ====================
let auth = fs.readFileSync('app/server/routes/auth.js', 'utf8');

const excluirUsuarioFn = `
async function excluirUsuario(req, res, usuario, id) {
  if (usuario.perfil !== 'admin') return erro(res, 403, 'Apenas administradores podem excluir usuários');
  const uid = Number(id);
  if (uid === usuario.id) return erro(res, 400, 'Você não pode excluir a si mesmo');
  const alvo = db.prepare('SELECT id, nome, perfil FROM usuarios WHERE id = ?').get(uid);
  if (!alvo) return erro(res, 404, 'Usuário não encontrado');
  if (alvo.perfil === 'admin') return erro(res, 400, 'Não é possível excluir outro administrador');
  const sessoes = db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ?').get(uid).n;
  if (sessoes > 0) return erro(res, 409, 'Este usuário possui sessões ativas. Faça logout dele primeiro');
  const devolucoes = db.prepare('SELECT COUNT(*) AS n FROM pix_devolucoes WHERE conferido_por = ?').get(uid).n;
  if (devolucoes > 0) return erro(res, 409, 'Este usuário possui devoluções registradas. Não pode ser excluído');
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(uid);
  json(res, 200, { ok: true });
}
`;

if (!auth.includes('excluirUsuario')) {
  auth = auth.replace('module.exports = {', excluirUsuarioFn + '\nmodule.exports = {');
  auth = auth.replace("listarUsuarios, salvarUsuario };", "listarUsuarios, salvarUsuario, excluirUsuario };");
  console.log('✓ auth.js: excluirUsuario adicionado');
} else { console.log('- auth.js: excluirUsuario já existe'); }

fs.writeFileSync('app/server/routes/auth.js', auth, 'utf8');


// ==================== PATCH 2: cadastros.js — excluirCliente com integridade ====================
let cad = fs.readFileSync('app/server/routes/cadastros.js', 'utf8');

const excluirClienteNovo = `async function excluirCliente(req, res, _u, id) {
  const uid = Number(id);
  const ags = db.prepare("SELECT COUNT(*) AS n FROM agendamentos WHERE cliente_id = ?").get(uid).n;
  if (ags > 0) return erro(res, 409, 'Este cliente possui ' + ags + ' agendamento(s). Use Inativar para mantê-lo no histórico.');
  db.prepare('DELETE FROM clientes WHERE id = ?').run(uid);
  json(res, 200, { ok: true });
}

async function inativarCliente(req, res, _u, id) {
  db.prepare('UPDATE clientes SET ativo = 0, atualizado_em = datetime(\\'now\\') WHERE id = ?').run(id);
  json(res, 200, { ok: true });
}`;

if (!cad.includes('inativarCliente')) {
  cad = cad.replace(
    "async function excluirCliente(req, res, _u, id) {\n  // exclusÃ£o lÃ³gica â€” mantÃ©m histÃ³rico de agendamentos\n  db.prepare('UPDATE clientes SET ativo = 0, atualizado_em = datetime(\\'now\\') WHERE id = ?').run(id);\n  json(res, 200, { ok: true });\n}",
    excluirClienteNovo
  );
  cad = cad.replace('excluirCliente,', 'excluirCliente, inativarCliente,');
  console.log('✓ cadastros.js: excluirCliente (hard) + inativarCliente (soft)');
} else { console.log('- cadastros.js: já atualizado'); }

fs.writeFileSync('app/server/routes/cadastros.js', cad, 'utf8');


// ==================== PATCH 3: server.js — rota DELETE para usuários ====================
let srv = fs.readFileSync('app/server/server.js', 'utf8');

const rotaDeleteUsuarios = `    if (metodo === 'DELETE' && id) return auth.excluirUsuario(req, res, usuario, id);`;

if (!srv.includes('auth.excluirUsuario')) {
  srv = srv.replace(
    "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);",
    "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);\n" + rotaDeleteUsuarios
  );
  console.log('✓ server.js: rota DELETE /api/usuarios/:id adicionada');
} else { console.log('- server.js: rota já existe'); }

fs.writeFileSync('app/server/server.js', srv, 'utf8');


// ==================== PATCH 4: app.js — botões Excluir em Usuários e Clientes ====================
let app = fs.readFileSync('app/public/js/app.js', 'utf8');

// 4a) Adicionar coluna Ações na tabela de Usuários
const tblUsuariosAntiga = `<td>${u.ativo ? '<span class="tag st-confirmado">Ativo</span>' : '<span class="tag st-cancelado">Inativo</span>'}</td>
      </tr>`).join('')}</tbody></table></div></div>`;

const tblUsuariosNova = `<td>${u.ativo ? '<span class="tag st-confirmado">Ativo</span>' : '<span class="tag st-cancelado">Inativo</span>'}</td>
        <td class="acoes-col"><button class="btn mini btn-sec" data-editar-usuario="${u.id}">Editar</button> <button class="btn mini btn-perigo" data-excluir-usuario="${u.id}">Excluir</button></td>
      </tr>`).join('')}</tbody></table></div></div>`;

if (app.includes(tblUsuariosAntiga)) {
  app = app.replace(tblUsuariosAntiga, tblUsuariosNova);
  console.log('✓ app.js: coluna Ações em Usuários');
} else { console.log('- app.js: tabela de usuários já tem ações'); }

// 4b) Adicionar botão Excluir (hard) ao lado do Inativar em Clientes
const cliBotoesAntigo = `<button class="btn mini btn-sec" data-excluir="${c.id}">Inativar</b`;
const cliBotoesNovo = `<button class="btn mini btn-perigo" data-excluir-definitivo="${c.id}">Excluir</button> <button class="btn mini btn-sec" data-excluir="${c.id}">Inativar</b`;

if (app.includes(cliBotoesAntigo) && !app.includes('data-excluir-definitivo')) {
  app = app.replace(cliBotoesAntigo, cliBotoesNovo);
  console.log('✓ app.js: botão Excluir em Clientes');
} else { console.log('- app.js: botão já existe'); }

// 4c) Adicionar handlers para os novos botões (antes do fechamento de paginaUsuarios)
const handlerUsuarios = `
  $$('#tab-usu [data-excluir-usuario]').forEach((b) => b.onclick = async () => {
    if (!confirmar('Excluir este usuário permanentemente? Esta ação não pode ser desfeita.')) return;
    await withLoading(async () => {
      try { await del('/api/usuarios/' + b.dataset.excluirUsuario); toast('Usuário excluído', 'ok'); location.reload(); }
      catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }
    });
  });
  $$('#tab-usu [data-editar-usuario]').forEach((b) => b.onclick = () => { toast('Editar usuário: em breve', 'ok'); });
`;

if (!app.includes('data-excluir-usuario')) {
  app = app.replace("$('#btn-novo').onclick = () => {", handlerUsuarios + "\n  $('#btn-novo').onclick = () => {");
  console.log('✓ app.js: handlers de excluir usuário');
} else { console.log('- app.js: handlers já existem'); }

// 4d) Handler para excluir cliente definitivo (hard delete)
const handlerCliHard = `
    $$('#tab-cli [data-excluir-definitivo]').forEach((b) => b.onclick = async () => {
      if (!confirmar('Excluir este cliente PERMANENTEMENTE? Só funciona se não houver agendamentos.')) return;
      await withLoading(async () => {
        try { await del('/api/clientes/' + b.dataset.excluirDefinitivo); toast('Cliente excluído', 'ok'); carregar(busca); }
        catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }
      });
    });
`;

if (!app.includes('data-excluir-definitivo')) {
  app = app.replace("$$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {", handlerCliHard + "\n    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {");
  console.log('✓ app.js: handler excluir cliente definitivo');
} else { console.log('- app.js: handler já existe'); }

fs.writeFileSync('app/public/js/app.js', app, 'utf8');

console.log('\n✅ TODOS OS PATCHES APLICADOS');
