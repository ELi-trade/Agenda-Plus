const fs = require('fs');
const file = 'app/public/js/app.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

let changed = false;

// ============ USUÁRIOS ============
// 1) Adicionar <th>Ações</th> no thead (procurar linha com <th>Status</th>)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<th>Status</th>') && lines[i].includes('Profissional vinculado')) {
    lines[i] = lines[i].replace('<th>Status</th>', '<th>Status</th><th>Ações</th>');
    console.log('Linha ' + (i+1) + ': adicionado <th>Ações</th> no thead de Usuários');
    changed = true;
    break;
  }
}

// 2) Adicionar botões antes de </tr> na tabela de Usuários
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("st-cancelado\">Inativo</span>'}</td>") && lines[i+1] && lines[i+1].includes("</tr>`).join('')")) {
    const insert = "        <td><button class=\"btn mini btn-sec\" data-editar-usuario=\"${u.id}\">Editar</button> <button class=\"btn mini btn-perigo\" data-excluir-usuario=\"${u.id}\">Excluir</button></td>";
    lines.splice(i+1, 0, insert);
    console.log('Linha ' + (i+2) + ': adicionados botões Editar/Excluir em Usuários');
    changed = true;
    break;
  }
}

// ============ CLIENTES ============
// 3) Adicionar botão Excluir ao lado do Inativar
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('data-excluir="${c.id}"') && lines[i].includes('Inativar')) {
    lines[i] = lines[i].replace(
      'data-excluir="${c.id}">Inativar',
      'data-excluir-definitivo="${c.id}">Excluir</button> <button class="btn mini btn-sec" data-excluir="${c.id}">Inativar'
    );
    console.log('Linha ' + (i+1) + ': adicionado botão Excluir em Clientes');
    changed = true;
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log(changed ? '\n✓ App.js modificado' : '\n- Nenhuma mudança aplicada');
