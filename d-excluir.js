const fs = require('fs');
const app = fs.readFileSync('app/public/js/app.js','utf8');
const lines = app.split('\n');

// A) O botao Excluir chegou a ser injetado?
console.log('A) tem data-excluir-assinatura no app.js?', app.includes('data-excluir-assinatura'));

// B) Texto CRU da linha do Detalhes (a tabela de assinaturas em paginaClube)
const i = lines.findIndex(l => l.includes('data-ver="${a.id}">Detalhes'));
console.log('B) linha do Detalhes encontrada em:', i >= 0 ? (i+1) : 'NAO');
if (i >= 0) {
  for (let j = i - 4; j <= i + 1 && j < lines.length; j++)
    if (j >= 0) console.log('   ' + (j+1) + ': ' + lines[j]);
}

// C) A API listarAssinaturas retorna a coluna status?
const as = fs.readFileSync('app/server/routes/assinaturas.js','utf8');
const la = as.split('\n');
const k = la.findIndex(l => l.includes('async function listarAssinaturas'));
console.log('C) listarAssinaturas em:', k >= 0 ? (k+1) : 'NAO');
if (k >= 0) for (let j = k; j < k + 12 && j < la.length; j++) console.log('   ' + (j+1) + ': ' + la[j]);
