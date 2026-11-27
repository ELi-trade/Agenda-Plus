const fs = require('fs');
const f = 'app/public/js/app.js';
let c = fs.readFileSync(f, 'utf8');

// 1) helper (adicionado 1 vez)
const helper = [
  'function telParaWhats(tel){ if(!tel) return null; var n=String(tel).replace(/\\D/g,""); if(n.length===11&&n[0]!=="5")n="55"+n; else if(n.length===10&&n[0]!=="5")n="55"+n; return n; }',
  'function linkWhats(tel){ var n=telParaWhats(tel); if(!n) return esc(tel); return "<a href=\\"https://wa.me/"+n+"\\" target=\\"_blank\\" rel=\\"noopener\\" class=\\"tel-whats\\" title=\\"Abrir conversa no WhatsApp\\">"+esc(tel)+" \\uD83D\\uDCAC</a>"; }',
  ''
].join('\n');

if (c.indexOf('function telParaWhats') === -1) {
  c = c.replace('// ==================== CLIENTES ====================', helper + '// ==================== CLIENTES ====================');
  console.log('helper adicionado');
} else { console.log('helper ja existia'); }

// 2) substitui a celula do telefone na tabela de clientes
var re = /<td>\$\{esc\(c\.telefone[^<]*<\/td>/;
if (re.test(c)) {
  c = c.replace(re, function(){ return "<td>${c.telefone ? linkWhats(c.telefone) : '\\u2014'}</td>"; });
  console.log('celula de telefone substituida');
} else { console.log('AVISO: celula nao encontrada (verifique)'); }

fs.writeFileSync(f, c, 'utf8');

// 3) CSS do link
var cf = 'app/public/css/futurista.css';
var cc = fs.readFileSync(cf, 'utf8');
if (cc.indexOf('tel-whats') === -1) {
  cc += '\n\na.tel-whats{color:#25D366!important;text-decoration:none!important;font-weight:600;transition:all .2s ease;}\na.tel-whats:hover{color:#128C7E!important;text-decoration:underline!important;}\n';
  fs.writeFileSync(cf, cc, 'utf8');
  console.log('CSS adicionado');
} else { console.log('CSS ja existia'); }

console.log('PATCH CONCLUIDO');
