const fs = require('fs');
let a = fs.readFileSync('app/public/js/app.js', 'utf8');

// 4a) Coluna Ações na tabela de Usuários
if (!a.includes('data-excluir-usuario')) {
  a = a.replace(
    /<td>\$\{u\.ativo \? '<span class="tag st-confirmado">Ativo<\/span>' : '<span class="tag st-cancelado">Inativo<\/span>'\}<\/td>\s*<\/tr>`\)\.join\(''\)<\/tbody><\/table><\/div><\/div>/,
    '<td>${u.ativo ? \'<span class="tag st-confirmado">Ativo</span>\' : \'<span class="tag st-cancelado">Inativo</span>\'}</td><td class="acoes-col"><button class="btn mini btn-sec" data-editar-usuario="${u.id}">Editar</button> <button class="btn mini btn-perigo" data-excluir-usuario="${u.id}">Excluir</button></td></tr>`).join(\'\')}</tbody></table></div></div>'
  );
  console.log('app.js: coluna Ações usuários');
}

// 4b) Botão Excluir em Clientes (ao lado do Inativar)
if (!a.includes('data-excluir-definitivo')) {
  a = a.replace(
    /<button class="btn mini btn-sec" data-excluir="\$\{c\.id\}">Inativar<\/b/,
    '<button class="btn mini btn-perigo" data-excluir-definitivo="${c.id}">Excluir</button> <button class="btn mini btn-sec" data-excluir="${c.id}">Inativar</b'
  );
  console.log('app.js: botão Excluir clientes');
}

// 4c) Handlers dos botões
const hdlUsu = [
  "  $$('#tab-usu [data-excluir-usuario]').forEach((b) => b.onclick = async () => {",
  "    if (!confirmar('Excluir este usuário permanentemente?')) return;",
  "    await withLoading(async () => {",
  "      try { await del('/api/usuarios/' + b.dataset.excluirUsuario); toast('Usuário excluído', 'ok'); location.reload(); }",
  "      catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }",
  '    });',
  '  });'
].join('\n');
if (!a.includes('data-excluir-usuario')) {
  a = a.replace("$('#btn-novo').onclick = () => {", hdlUsu + "\n  $('#btn-novo').onclick = () => {");
  console.log('app.js: handler usuários');
}

const hdlCli = [
  "    $$('#tab-cli [data-excluir-definitivo]').forEach((b) => b.onclick = async () => {",
  "      if (!confirmar('Excluir este cliente PERMANENTEMENTE?')) return;",
  "      await withLoading(async () => {",
  "        try { await del('/api/clientes/' + b.dataset.excluirDefinitivo); toast('Cliente excluído', 'ok'); carregar(busca); }",
  "        catch (e) { toast(e.message || 'Erro ao excluir', 'erro'); }",
  '      });',
  '    });'
].join('\n');
if (!a.includes('data-excluir-definitivo')) {
  a = a.replace("$$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {", hdlCli + "\n    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {");
  console.log('app.js: handler clientes');
}

fs.writeFileSync('app/public/js/app.js', a, 'utf8');
console.log('app.js OK');
