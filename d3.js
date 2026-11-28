const fs=require('fs');
const a=fs.readFileSync('app/server/routes/assinaturas.js','utf8');
const l=a.split('\n');
console.log('tem gerarCheckoutAssinatura?', a.includes('gerarCheckoutAssinatura'));
console.log('tem consultarCheckout?', a.includes('async function consultarCheckout'));
console.log('tem excluirAssinatura?', a.includes('excluirAssinatura'));
console.log('tem monitor?', a.includes('monitor'));
// module.exports atual:
const me=a.indexOf('module.exports');
console.log('--- module.exports ---');
l.slice(me, me+12).forEach((x,n)=>console.log((n+1)+': '+x));
