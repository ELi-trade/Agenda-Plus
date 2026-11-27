const fs = require('fs');
const chk = (f, s) => fs.readFileSync(f,'utf8').includes(s);
console.log('P1 auth.excluirUsuario   :', chk('app/server/routes/auth.js','excluirUsuario') ? 'OK':'MISSING');
console.log('P2 cad.inativarCliente   :', chk('app/server/routes/cadastros.js','inativarCliente') ? 'OK':'MISSING');
console.log('P3 server DELETE usuarios:', chk('app/server/server.js','auth.excluirUsuario') ? 'OK':'MISSING');
console.log('P4 app data-excluir-usuario:', chk('app/public/js/app.js','data-excluir-usuario') ? 'OK':'MISSING');
console.log('P4 app data-excluir-definitivo:', chk('app/public/js/app.js','data-excluir-definitivo') ? 'OK':'MISSING');
