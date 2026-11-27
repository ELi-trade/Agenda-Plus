const fs = require('fs');
let c = fs.readFileSync('app/server/routes/cadastros.js', 'utf8');
if (c.includes('inativarCliente')) { console.log('ja existe'); process.exit(); }
const novo = [
  'async function excluirCliente(req, res, _u, id) {',
  '  const uid = Number(id);',
  '  const ags = db.prepare("SELECT COUNT(*) AS n FROM agendamentos WHERE cliente_id = ?").get(uid).n;',
  "  if (ags > 0) return erro(res, 409, 'Este cliente possui ' + ags + ' agendamento(s). Use Inativar para mantê-lo no histórico.');",
  "  db.prepare('DELETE FROM clientes WHERE id = ?').run(uid);",
  '  json(res, 200, { ok: true });',
  '}',
  '',
  'async function inativarCliente(req, res, _u, id) {',
  "  db.prepare('UPDATE clientes SET ativo = 0, atualizado_em = datetime(\\'now\\') WHERE id = ?').run(id);",
  '  json(res, 200, { ok: true });',
  '}'
].join('\n');
c = c.replace(/async function excluirCliente[\s\S]*?json\(res, 200, \{ ok: true \}\);\n\}/, novo);
c = c.replace('excluirCliente,', 'excluirCliente, inativarCliente,');
fs.writeFileSync('app/server/routes/cadastros.js', c, 'utf8');
console.log('cadastros.js OK');
