const fs = require('fs');
const file = 'app/public/js/app.js';
let content = fs.readFileSync(file, 'utf8');

// Handler para excluir usuário (inserir antes de $('#btn-novo').onclick em paginaUsuarios)
const handlerUsu = [
  "  $$('#tab-usu [data-excluir-usuario]').forEach((b) => b.onclick = async () => {",
  "    if (!confirmar('Excluir este usuário permanentemente?')) return;",
  "    await withLoading(async () => {",
  "      try { await del('/api/usuarios/' + b.dataset.excluirUsuario); toast('Usuário excluído', 'ok'); location.reload(); }",
  "      catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }",
  '    });',
  '  });'
].join('\n');

if (!content.includes('data-excluir-usuario]').forEach')) {
  content = content.replace("  $('#btn-novo').onclick = () => {", handlerUsu + "\n  $('#btn-novo').onclick = () => {");
  console.log('✓ app.js: handler excluir usuário adicionado');
}

// Handler para excluir cliente (inserir antes do handler de inativar)
const handlerCli = [
  "    $$('#tab-cli [data-excluir-definitivo]').forEach((b) => b.onclick = async () => {",
  "      if (!confirmar('Excluir este cliente PERMANENTEMENTE?')) return;",
  "      await withLoading(async () => {",
  "        try { await del('/api/clientes/' + b.dataset.excluirDefinitivo); toast('Cliente excluído', 'ok'); carregar(busca); }",
  "        catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }",
  '      });',
  '    });'
].join('\n');

if (!content.includes('data-excluir-definitivo]').forEach')) {
  content = content.replace("    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {", handlerCli + "\n    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {");
  console.log('✓ app.js: handler excluir cliente adicionado');
}

fs.writeFileSync(file, content, 'utf8');
