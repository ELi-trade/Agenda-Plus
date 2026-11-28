const fs=require('fs');
const a=fs.readFileSync('app/server/routes/agendamentos.js','utf8').split('\n');
a.forEach((l,i)=>{ if(/excluir|DELETE|devolu|sinal|estorn|pix_pagamentos|confirmar\(/i.test(l)) console.log((i+1)+': '+l.trim()); });
