const fs = require('fs');
const f = 'app/server/routes/assinaturas.js';
let c = fs.readFileSync(f, 'utf8');
const antigo = "const permitidos = ['ativa', 'cancelada', 'cancelamento_solicitado', 'expirada'];";
const novo   = "const permitidos = ['pendente', 'ativa', 'cancelada', 'cancelamento_solicitado', 'expirada'];";
if (c.includes(antigo)) {
  c = c.replace(antigo, novo);
  fs.writeFileSync(f, c, 'utf8');
  console.log('✓ pendente adicionado aos status permitidos');
} else {
  console.log('- ja corrigido ou padrao mudou');
}
