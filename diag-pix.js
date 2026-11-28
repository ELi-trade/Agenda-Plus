const fs = require('fs');

// ---- pagamentos/index.js: API exportada + assinaturas das funções ----
const pg = fs.readFileSync('app/server/pagamentos/index.js', 'utf8');
const linhas = pg.split('\n');
console.log('===== PAGAMENTOS/INDEX.JS =====');
console.log('module.exports:', (pg.match(/module\.exports\s*=\s*\{[^}]*\}/)||['(achar manual)'])[0]);
linhas.forEach((l,i)=>{
  if (/criarPagamento|consultar|status|verificar|webhook|checkout|token|QR|qrcode|expires|expir/i.test(l))
    console.log((i+1)+': '+l.trim());
});

// ---- assinaturas.js: contratar + confirmarPagamento ----
console.log('\n===== ASSINATURAS.JS (contratar/confirmar) =====');
const as = fs.readFileSync('app/server/routes/assinaturas.js','utf8').split('\n');
as.forEach((l,i)=>{
  if (/async function contratar|async function confirmarPagamento|criarPagamento|pix_manual|checkoutToken|pagamento_status|module\.exports/.test(l))
    console.log((i+1)+': '+l.trim());
});
