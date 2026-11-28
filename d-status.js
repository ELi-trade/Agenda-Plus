const fs=require('fs');

// 1) Função alterarStatusAssinatura no backend (lista de status aceitos)
const as=fs.readFileSync('app/server/routes/assinaturas.js','utf8').split('\n');
const i=as.findIndex(l=>l.includes('async function alterarStatusAssinatura'));
console.log('=== alterarStatusAssinatura (backend) ===');
if(i>=0){ for(let j=i;j<i+30 && j<as.length;j++) console.log((j+1)+': '+as[j]); }
else console.log('Nao encontrada');

// 2) Select de status no modal do frontend (lista que aparece)
const app=fs.readFileSync('app/public/js/app.js','utf8').split('\n');
const k=app.findIndex(l=>l.includes('id="as-status"'));
console.log('\n=== select as-status (frontend) ===');
if(k>=0){ for(let j=k;j<k+4 && j<app.length;j++) console.log((j+1)+': '+app[j]); }
else console.log('Nao encontrada');

// 3) Mensagem exata do erro
console.log('\n=== ocorrencias de "Status invalido" ===');
as.forEach((l,n)=>{ if(/Status\s+inv[aá]lido/i.test(l)) console.log('assinaturas.js:'+(n+1)+': '+l.trim()); });
