const fs = require('fs');
const as = fs.readFileSync('app/server/routes/assinaturas.js','utf8').split('\n');
// contratarCliente começa na linha ~357 (índice 356)
for (let i=356; i<420 && i<as.length; i++) console.log((i+1)+': '+as[i]);
