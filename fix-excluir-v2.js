const fs = require('fs');
const appFile = 'app/public/js/app.js';
let lines = fs.readFileSync(appFile, 'utf8').split('\n');

console.log('Total de linhas:', lines.length);

// ============ PASSO 1: Verificar se já existe ============
const jaExiste = lines.some(l => l.includes('data-excluir-assinatura'));
if (jaExiste) {
  console.log('✗ Botão Excluir já existe no código. Abortando.');
  process.exit(1);
}

// ============ PASSO 2: Editar linha 2137 (índice 2136) ============
const linhaIdx = 2136;
console.log('Linha 2137 atual:', lines[linhaIdx].substring(0, 100) + '...');

// Verificar se é a linha certa
if (!lines[linhaIdx].includes('data-ver="${a.id}">Detalhes')) {
  console.log('✗ Linha 2137 não é a esperada. Abortando.');
  console.log('Conteúdo:', lines[linhaIdx]);
  process.exit(1);
}

// Inserir botão Excluir antes de </td></tr>
const linhaOriginal = lines[linhaIdx];
const linhaNova = linhaOriginal.replace(
  '</td></tr>',
  '<td>${a.status !== \'ativa\' ? \'<button class="btn mini btn-perigo" data-excluir-assinatura="${a.id}">Excluir</button>\' : \'\'}</td></tr>'
);
lines[linhaIdx] = linhaNova;
console.log('✓ Linha 2137 editada');

// ============ PASSO 3: Adicionar handler (antes do handler data-ver) ============
const handlerIdx = lines.findIndex(l => l.includes("$$('[data-ver]').forEach((b) => b.onclick"));
if (handlerIdx < 0) {
  console.log('✗ Handler data-ver não encontrado. Abortando.');
  process.exit(1);
}

const handlerExcluir = [
  "    $$('[data-excluir-assinatura]').forEach((b) => b.onclick = async () => {",
  "      if (!confirmar('Excluir esta assinatura?')) return;",
  "      await withLoading(async () => {",
  "        try { await del('/api/clube/assinaturas/' + b.dataset.excluirAssinatura); toast('Assinatura excluída.', 'ok'); paginaClube(); }",
  "        catch (e) { toast(e.message, 'erro'); }",
  "      });",
  "    });"
].join('\n');

lines.splice(handlerIdx, 0, handlerExcluir);
console.log('✓ Handler Excluir inserido na linha ' + (handlerIdx + 1));

// ============ PASSO 4: Salvar ============
fs.writeFileSync(appFile, lines.join('\n'), 'utf8');
console.log('✓ app.js salvo');

// ============ PASSO 5: Validar sintaxe ============
console.log('\nExecutando node --check...');
