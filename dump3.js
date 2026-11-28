const fs = require('fs');
const app = fs.readFileSync('app/public/js/app.js','utf8').split('\n');
// paginaClubeCliente começa na linha ~487 (índice 486)
for (let i=486; i<560 && i<app.length; i++) console.log((i+1)+': '+app[i]);
