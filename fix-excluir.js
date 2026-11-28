const fs = require('fs');
const appFile = 'app/public/js/app.js';
const lines = fs.readFileSync(appFile, 'utf8').split('\n');

// ============ 1) Botão Excluir na tabela (linha 2137, índice 2136) ============
const idxDetalhes = lines.findIndex(l => l.includes('data-ver="${a.id}">Detalhes</button></td></tr>'));
console.log('Linha Detalhes encontrada em:', idxDetalhes >= 0 ? (idxDetalhes + 1) : 'NAO');

if (idxDetalhes >= 0) {
  const linhaOriginal = lines[idxDetalhes];
  // Substituir </td></tr> por </td><td>...Excluir...</td></tr>
  const linhaNova = linhaOriginal.replace(
    '<td><button class="btn mini btn-sec" data-ver="${a.id}">Detalhes</button></td></tr>',
    '<td><button class="btn mini btn-sec" data-ver="${a.id}">Detalhes</button>${a.status === \'pendente\' ? \' <button class="btn mini btn-perigo" data-excluir-assinatura="${a.id}">Excluir</button>\' : \'\'}</td></tr>'
  );
  lines[idxDetalhes] = linhaNova;
  console.log('✓ Linha ' + (idxDetalhes + 1) + ' editada com botão Excluir');
} else {
  console.log('✗ Linha Detalhes não encontrada');
}

// ============ 2) Handler do botão Excluir (antes do handler data-ver) ============
const idxHandler = lines.findIndex(l => l.includes("$$('[data-ver]').forEach((b) => b.onclick"));
console.log('Handler data-ver encontrado em:', idxHandler >= 0 ? (idxHandler + 1) : 'NAO');

if (idxHandler >= 0 && !lines.join('\n').includes('data-excluir-assinatura').forEach')) {
  const handlerExcluir = [
    "    $$('[data-excluir-assinatura]').forEach((b) => b.onclick = async () => {",
    "      if (!confirmar('Excluir esta assinatura não paga?')) return;",
    "      await withLoading(async () => {",
    "        try { await del('/api/clube/assinaturas/' + b.dataset.excluirAssinatura); toast('Assinatura excluída.', 'ok'); paginaClube(); }",
    "        catch (e) { toast(e.message, 'erro'); }",
    "      });",
    "    });"
  ].join('\n');
  lines.splice(idxHandler, 0, handlerExcluir);
  console.log('✓ Handler Excluir inserido na linha ' + (idxHandler + 1));
} else if (lines.join('\n').includes('data-excluir-assinatura').forEach')) {
  console.log('- Handler Excluir já existe');
}

fs.writeFileSync(appFile, lines.join('\n'), 'utf8');
console.log('\n✅ app.js atualizado');
