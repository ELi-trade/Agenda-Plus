const fs = require('fs');
let s = fs.readFileSync('app/server/server.js', 'utf8');
if (s.includes('auth.excluirUsuario')) { console.log('ja existe'); process.exit(); }
s = s.replace(
  "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);",
  "if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);\n    if (metodo === 'DELETE' && id) return auth.excluirUsuario(req, res, usuario, id);"
);
fs.writeFileSync('app/server/server.js', s, 'utf8');
console.log('server.js OK');
