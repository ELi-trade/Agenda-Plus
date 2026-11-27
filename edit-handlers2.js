const fs = require('fs');
const file = 'app/public/js/app.js';
let content = fs.readFileSync(file, 'utf8');

const handlerUsu = [
  "  $$('#tab-usu [data-excluir-usuario]').forEach((b) => b.onclick = async () => {",
  "    if (!confirmar('Excluir este usuario permanentemente?')) return;",
  "    await withLoading(async () => {",
  "      try { await del('/api/usuarios/' + b.dataset.excluirUsuario); toast('Usuario excluido', 'ok'); location.reload(); }",
  "      catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }",
  '    });',
  '  });'
].join('\n');

const buscaUsu = "$$('#tab-usu [data-excluir-usuario]').forEach";
if (content.indexOf(buscaUsu) === -1) {
  content = content.replace("  $('#btn-novo').onclick = () => {", handlerUsu + "\n  $('#btn-novo').onclick = () => {");
  console.log('OK handler usuarios');
} else { console.log('handler usuarios ja existe'); }

const handlerCli = [
  "    $$('#tab-cli [data-excluir-definitivo]').forEach((b) => b.onclick = async () => {",
  "      if (!confirmar('Excluir este cliente PERMANENTEMENTE?')) return;",
  "      await withLoading(async () => {",
  "        try { await del('/api/clientes/' + b.dataset.excluirDefinitivo); toast('Cliente excluido', 'ok'); carregar(busca); }",
  "        catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }",
  '      });',
  '    });'
].join('\n');

const buscaCli = "$$('#tab-cli [data-excluir-definitivo]').forEach";
if (content.indexOf(buscaCli) === -1) {
  content = content.replace("    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {", handlerCli + "\n    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {");
  console.log('OK handler clientes');
} else { console.log('handler clientes ja existe'); }

fs.writeFileSync(file, content, 'utf8');
console.log('FIM');
