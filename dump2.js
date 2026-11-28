const fs = require('fs');
const pg = fs.readFileSync('app/server/pagamentos/index.js','utf8').split('\n');
// procurar "chave" "chave_pix" "config" "chavePix" nas primeiras 80 linhas
for (let i=0; i<80 && i<pg.length; i++) {
  if (/chave|config|chavePix|chave_pix|getChave/i.test(pg[i]))
    console.log((i+1)+': '+pg[i]);
}
