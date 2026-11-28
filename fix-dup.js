const fs = require('fs');
const srv = fs.readFileSync('app/server/server.js','utf8').split('\n');

// Encontrar todas as linhas com "const mCheckout = pathname.match"
const indices = [];
srv.forEach((l,i) => { if (l.includes('const mCheckout = pathname.match')) indices.push(i); });
console.log('Linhas mCheckout encontradas:', indices.map(i=>i+1));

if (indices.length > 1) {
  // Manter a primeira, remover as demais (e as 2 linhas seguintes de cada)
  for (let k = indices.length - 1; k >= 1; k--) {
    const idx = indices[k];
    // Remover linha do match + as 2 linhas seguintes (if GET + if POST)
    srv.splice(idx, 3);
    console.log('Removidas linhas ' + (idx+1) + ' a ' + (idx+3));
  }
  fs.writeFileSync('app/server/server.js', srv.join('\n'), 'utf8');
  console.log('✓ Duplicata removida');
} else {
  console.log('- Nenhuma duplicata encontrada');
}
