const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// 1) contratarCliente REAL: será que chama gerarCheckoutAssinatura?
const as = fs.readFileSync('app/server/routes/assinaturas.js','utf8');
const i = as.indexOf('async function contratarCliente');
const trecho = as.slice(i, i+1400);
console.log('=== contratarCliente (tem chamada de checkout?) ===');
console.log('gerarCheckoutAssinatura( chamado dentro?', trecho.includes('gerarCheckoutAssinatura('));
console.log('retorna checkout?', /checkout/.test(trecho));
console.log('--- trecho cru (linhas 1 a 30) ---');
trecho.split('\n').slice(0,30).forEach((l,n)=>console.log((n+1)+': '+l));

// 2) header do paginaClubeCliente (por que sumiu?)
const app = fs.readFileSync('app/public/js/app.js','utf8');
const j = app.indexOf('async function paginaClubeCliente');
const h = app.slice(j, j+1200);
console.log('\n=== paginaClubeCliente (header/client-shell?) ===');
console.log('tem client-shell?', h.includes('client-shell'));
console.log('tem sair-cliente?', h.includes('sair-cliente'));
h.split('\n').slice(0,25).forEach((l,n)=>console.log((n+1)+': '+l));

// 3) tabela configuracoes + chave_pix existe?
const db = new DatabaseSync('./app/server/data/agendamento.db');
try {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='configuracoes'").get();
  console.log('\n=== configuracoes ===');
  console.log('tabela existe?', !!t);
  if (t) {
    const cols = db.prepare('PRAGMA table_info(configuracoes)').all().map(c=>c.name);
    console.log('colunas:', cols.join(','));
    const k = db.prepare("SELECT chave FROM configuracoes WHERE chave LIKE '%pix%'").all();
    console.log('chaves pix:', k.map(x=>x.chave).join(','));
  }
} catch(e){ console.log('erro configuracoes:', e.message); }

// 4) colunas novas de subscription_payments (o ALTER rodou?)
const sp = db.prepare('PRAGMA table_info(subscription_payments)').all().map(c=>c.name);
console.log('\n=== subscription_payments colunas ===');
console.log(sp.join(','));
console.log('tem checkout_token_hash?', sp.includes('checkout_token_hash'));
