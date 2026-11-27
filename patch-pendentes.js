const fs = require('fs');

// ==================== BACKEND: dashboard.js ====================
const dashFile = 'app/server/routes/dashboard.js';
let dash = fs.readFileSync(dashFile, 'utf8');

if (dash.includes('pendentes_centavos')) {
  console.log('- dashboard.js: pendentes ja existe');
} else {
  const anchorQuery = "const financeiro = temPermissao(usuario, 'financeiro') ? resumoFinanceiro(inicioMes, fimMes, hoje) : null;";
  const anchorResp  = "    hoje, mes, resumo, financeiro, agendamentos_hoje: deHoje, proximos,";

  if (dash.indexOf(anchorQuery) === -1) { console.log('ERRO: anchorQuery nao encontrada'); process.exit(1); }
  if (dash.indexOf(anchorResp)  === -1) { console.log('ERRO: anchorResp nao encontrada'); process.exit(1); }

  const query = [
    "  const pendentes = db.prepare(`",
    "    SELECT a.id, a.data, a.hora_inicio, c.nome AS cliente, s.nome AS servico,",
    "           a.valor_final_centavos, pp.valor_sinal_centavos,",
    "           (a.valor_final_centavos - pp.valor_sinal_centavos) AS pendente_centavos",
    "    FROM agendamentos a",
    "    JOIN clientes c ON c.id = a.cliente_id",
    "    JOIN servicos s ON s.id = a.servico_id",
    "    JOIN pix_pagamentos pp ON pp.agendamento_id = a.id",
    "    WHERE a.status IN ('finalizado', 'em_atendimento')",
    "      AND pp.status = 'pago'",
    "      AND a.valor_final_centavos > pp.valor_sinal_centavos",
    "      AND NOT EXISTS (SELECT 1 FROM lancamentos_financeiros lf WHERE lf.observacoes = 'RESTANTE-' || a.id)",
    "    ORDER BY a.data, a.hora_inicio",
    "  `).all();",
    "  const total_pendente_centavos = pendentes.reduce((s, p) => s + p.pendente_centavos, 0);",
    ""
  ].join('\n');

  dash = dash.replace(anchorQuery, query + anchorQuery);
  dash = dash.replace(anchorResp, "    hoje, mes, resumo, financeiro, pendentes, total_pendente_centavos, agendamentos_hoje: deHoje, proximos,");
  fs.writeFileSync(dashFile, dash, 'utf8');
  console.log('✓ dashboard.js: query de pendentes adicionada');
}


// ==================== FRONTEND: app.js ====================
const appFile = 'app/public/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// Ancora: insere a secao de pendentes DENTRO do bloco fin ? (antes do : do ternario)
const ancora = "</section>` : `\n        <section class=\"dash-section\"><h2>Agenda de hoje</h2>";
if (app.indexOf(ancora) === -1) {
  console.log('ERRO: ancora frontend nao encontrada');
  process.exit(1);
}

if (app.includes('data-receber=')) {
  console.log('- app.js: secao pendentes ja existe');
} else {
  const secao = [
    '<section class="dash-section">',
    '  <h2>💰 A Receber no Atendimento</h2>',
    '  <div class="pendentes-header"><span class="pendentes-total">Total: <b>${valor(d.total_pendente_centavos)}</b></span></div>',
    "  ${d.pendentes.length ? `<div class=\"card\"><div class=\"tabela-responsiva\"><table class=\"finance-list\"><thead><tr><th>Data/Hora</th><th>Cliente</th><th>Serviço</th><th>Total</th><th>Sinal</th><th>Pendente</th><th></th></tr></thead><tbody>",
    "    ${d.pendentes.map(p => `<tr><td>${fmtData(p.data)} ${fmtHora(p.hora_inicio)}</td><td><b>${esc(p.cliente)}</b></td><td>${esc(p.servico)}</td><td>${valor(p.valor_final_centavos)}</td><td>${valor(p.valor_sinal_centavos)}</td><td class=\"valor-receber\"><b>${valor(p.pendente_centavos)}</b></td><td><button class=\"btn mini btn-ok\" data-receber=\"${p.id}\" data-valor=\"${p.pendente_centavos}\" data-cliente=\"${esc(p.cliente)}\" data-servico=\"${esc(p.servico)}\">Marcar recebido</button></td></tr>`).join('')}",
    '  </tbody></table></div></div>` : \'<div class="vazio">Nenhum valor pendente.</div>\'}',
    '</section>',
    ''
  ].join('\n');

  app = app.replace(ancora, secao + ancora);
  console.log('✓ app.js: secao de pendentes adicionada');
}

// Handler do botao "Marcar recebido"
const handlerAnchor = "  $$('[data-quick]').forEach";
if (app.indexOf(handlerAnchor) === -1) {
  console.log('ERRO: handler anchor nao encontrada');
  process.exit(1);
}

if (!app.includes("data-receber']").forEach")) {
  const handler = [
    "  $$('[data-receber]').forEach((b) => b.onclick = async () => {",
    "    const valorReal = (Number(b.dataset.valor) / 100).toFixed(2).replace('.', ',');",
    "    if (!confirmar('Confirmar recebimento de R$ ' + valorReal + ' de ' + b.dataset.cliente + '?')) return;",
    "    await withLoading(async () => {",
    "      try {",
    "        const hoje = new Date().toISOString().slice(0, 10);",
    "        await post('/api/financeiro', {",
    "          tipo: 'receber',",
    "          descricao: 'Restante - ' + b.dataset.servico + ' (' + b.dataset.cliente + ')',",
    "          valor: valorReal,",
    "          vencimento: hoje,",
    "          status: 'realizado',",
    "          data_pagamento: hoje,",
    "          observacoes: 'RESTANTE-' + b.dataset.receber",
    "        });",
    "        toast('Recebimento registrado', 'ok');",
    "        location.reload();",
    "      } catch (e) { toast(e.message || 'Erro ao registrar', 'erro'); }",
    "    });",
    "  });",
    ""
  ].join('\n');

  app = app.replace(handlerAnchor, handler + handlerAnchor);
  console.log('✓ app.js: handler "Marcar recebido" adicionado');
} else {
  console.log('- app.js: handler ja existe');
}

fs.writeFileSync(appFile, app, 'utf8');
console.log('\n✅ TODOS OS PATCHES APLICADOS');
