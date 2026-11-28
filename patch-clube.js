const fs = require('fs');

// ==================== 1) BACKEND: assinaturas.js ====================
const asFile = 'app/server/routes/assinaturas.js';
let as = fs.readFileSync(asFile, 'utf8');

// 1a) Adicionar excluirAssinatura (antes de module.exports)
const excluirFn = [
  "async function excluirAssinatura(req, res, usuario, id) {",
  "  if (usuario.perfil !== 'admin') return erro(res, 403, 'Apenas administradores podem excluir assinaturas');",
  "  const uid = Number(id);",
  "  const a = db.prepare('SELECT id, status FROM subscriptions WHERE id = ?').get(uid);",
  "  if (!a) return erro(res, 404, 'Assinatura não encontrada');",
  "  if (a.status !== 'pendente') return erro(res, 409, 'Só é possível excluir assinaturas não pagas. Para ativas, use Cancelar.');",
  "  db.transaction(() => {",
  "    db.prepare('DELETE FROM subscription_payments WHERE assinatura_id = ?').run(uid);",
  "    db.prepare('DELETE FROM subscription_usage WHERE ciclo_id IN (SELECT id FROM subscription_cycles WHERE assinatura_id = ?)').run(uid);",
  "    db.prepare('DELETE FROM subscription_entitlements WHERE ciclo_id IN (SELECT id FROM subscription_cycles WHERE assinatura_id = ?)').run(uid);",
  "    db.prepare('DELETE FROM subscription_cycles WHERE assinatura_id = ?').run(uid);",
  "    db.prepare('DELETE FROM subscriptions WHERE id = ?').run(uid);",
  "  })();",
  "  auditar('exclusao_assinatura', { usuarioId: usuario.id, entidade: 'assinatura', entidadeId: uid });",
  "  json(res, 200, { ok: true });",
  "}",
  ""
].join('\n');

if (!as.includes('async function excluirAssinatura')) {
  as = as.replace('module.exports = {', excluirFn + 'module.exports = {');
  as = as.replace(
    'clubeCliente, contratarCliente, consultarCheckout, informarPagamentoAssinatura, cancelarCliente, planosPublicos,',
    'clubeCliente, contratarCliente, consultarCheckout, informarPagamentoAssinatura, cancelarCliente, excluirAssinatura, planosPublicos,'
  );
  console.log('✓ excluirAssinatura adicionado');
}

// 1b) Adicionar endpoint de monitor (antes de module.exports)
const monitorFn = [
  "// ==================== Monitor de assinaturas pendentes ====================",
  "async function monitorAssinaturas(req, res) {",
  "  const since = Number(new URL(req.url, 'http://x').searchParams.get('since') || 0);",
  "  const pendentes = db.prepare(`",
  "    SELECT s.id, s.cliente_id, c.nome AS cliente, sp.nome AS plano, s.criado_em",
  "    FROM subscriptions s",
  "    JOIN clientes c ON c.id = s.cliente_id",
  "    JOIN subscription_plans sp ON sp.id = s.plano_id",
  "    WHERE s.status = 'pendente' AND s.id > ? ORDER BY s.id",
  "  `).all(since);",
  "  json(res, 200, pendentes);",
  "}",
  ""
].join('\n');

if (!as.includes('async function monitorAssinaturas')) {
  as = as.replace('module.exports = {', monitorFn + 'module.exports = {');
  as = as.replace(
    'clubeCliente, contratarCliente, consultarCheckout, informarPagamentoAssinatura, cancelarCliente, excluirAssinatura, planosPublicos,',
    'clubeCliente, contratarCliente, consultarCheckout, informarPagamentoAssinatura, cancelarCliente, excluirAssinatura, monitorAssinaturas, planosPublicos,'
  );
  console.log('✓ monitorAssinaturas adicionado');
}

fs.writeFileSync(asFile, as, 'utf8');


// ==================== 2) BACKEND: server.js — registrar rotas ====================
const srvFile = 'app/server/server.js';
let srv = fs.readFileSync(srvFile, 'utf8');

if (!srv.includes('/api/clube/monitor')) {
  srv = srv.replace(
    "if (pathname === '/api/clube/cliente/cancelar' && metodo === 'POST') return club.cancelarCliente(req, res);",
    "if (pathname === '/api/clube/cliente/cancelar' && metodo === 'POST') return club.cancelarCliente(req, res);\n    if (pathname === '/api/clube/monitor' && metodo === 'GET') return club.monitorAssinaturas(req, res);\n    if (pathname.match(/^\\/api\\/clube\\/assinaturas\\/\\d+$/) && metodo === 'DELETE') return club.excluirAssinatura(req, res, usuario, Number(pathname.split('/').pop()));"
  );
  console.log('✓ rotas monitor + excluir no server.js');
}

fs.writeFileSync(srvFile, srv, 'utf8');


// ==================== 3) FRONTEND: app.js ====================
const appFile = 'app/public/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// 3a) Adicionar botão Excluir na tabela de assinaturas (só se status='pendente')
if (!app.includes('data-excluir-assinatura')) {
  app = app.replace(
    '<td><button class="btn mini btn-sec" data-ver="${a.id}">Detalhes</button></td>',
    '<td><button class="btn mini btn-sec" data-ver="${a.id}">Detalhes</button>${a.status === \'pendente\' ? ` <button class="btn mini btn-perigo" data-excluir-assinatura="${a.id}">Excluir</button>` : \'\'}</td>'
  );
  console.log('✓ botão Excluir na tabela');
}

// 3b) Adicionar handler do botão Excluir (antes do handler de data-ver)
if (!app.includes("data-excluir-assinatura']").forEach")) {
  app = app.replace(
    "$$('[data-ver]').forEach((b) => b.onclick = async () => {",
    "$$('[data-excluir-assinatura]').forEach((b) => b.onclick = async () => {\n      if (!confirmar('Excluir esta assinatura não paga?')) return;\n      await withLoading(async () => {\n        try { await del('/api/clube/assinaturas/' + b.dataset.excluirAssinatura); toast('Assinatura excluída.', 'ok'); paginaClube(); }\n        catch (e) { toast(e.message, 'erro'); }\n      });\n    });\n    $$('[data-ver]').forEach((b) => b.onclick = async () => {"
  );
  console.log('✓ handler Excluir adicionado');
}

// 3c) Adicionar monitor de assinaturas ao monitorAgendamentos existente
if (!app.includes('monitorAssinaturas')) {
  // Inserir após atualizarAlertasAgendamentos
  const monitorAssinaturasFn = [
    "async function atualizarMonitorAssinaturas() {",
    "  if (monitorAgendamentos.busy || state.user?.perfil !== 'admin') return;",
    "  const geracao = monitorAgendamentos.geracao;",
    "  monitorAgendamentos.busy = true;",
    "  try {",
    "    const pendentes = await get('/api/clube/monitor');",
    "    if (geracao !== monitorAgendamentos.geracao || state.user?.perfil !== 'admin') return;",
    "    if (pendentes.length) {",
    "      pendentes.forEach(p => {",
    "        if (!monitorAgendamentos.assinaturasVistas.includes(p.id)) {",
    "          monitorAgendamentos.assinaturasVistas.push(p.id);",
    "          iniciarSomAgendamento();",
    "        }",
    "      });",
    "      const caixa = $('#alerta-agendamentos-online');",
    "      if (caixa && pendentes.length) {",
    "        const linhas = pendentes.map(p => '<article class=\"alerta-agendamento-item\"><div class=\"alerta-agendamento-detalhes\"><strong>Nova assinatura · ' + esc(p.cliente) + '</strong><span>Plano: ' + esc(p.plano) + ' · aguardando pagamento</span><span>Abra Clube de Assinaturas para confirmar.</span></div><div class=\"alerta-agendamento-acoes\"><a class=\"btn btn-sec mini\" href=\"#/clube\">Abrir Clube</a></div></article>').join('');",
    "        caixa.classList.add('ativo');",
    "        caixa.innerHTML = '<div class=\"alerta-agendamentos-cabecalho\"><div><strong>' + pendentes.length + ' nova(s) assinatura(ões)</strong><span>O alerta se repetirá até confirmar.</span></div></div><div class=\"alerta-agendamentos-lista\">' + linhas + '</div>';",
    "      }",
    "    }",
    "  } catch {}",
    "  finally { if (geracao === monitorAgendamentos.geracao) monitorAgendamentos.busy = false; }",
    "}",
    ""
  ].join('\n');
  
  app = app.replace('function iniciarMonitorAgendamentos() {', monitorAssinaturasFn + 'function iniciarMonitorAgendamentos() {');
  console.log('✓ função monitorAssinaturas adicionada');
}

// 3d) Inicializar assinaturasVistas no monitorAgendamentos
if (!app.includes('assinaturasVistas')) {
  app = app.replace(
    "const monitorAgendamentos = {",
    "const monitorAgendamentos = {\n  assinaturasVistas: [],"
  );
  console.log('✓ assinaturasVistas inicializado');
}

// 3e) Chamar atualizarMonitorAssinaturas no timer
if (!app.includes('atualizarMonitorAssinaturas()')) {
  app = app.replace(
    "atualizarAlertasAgendamentos();",
    "atualizarAlertasAgendamentos(); atualizarMonitorAssinaturas();"
  );
  console.log('✓ monitorAssinaturas no timer');
}

fs.writeFileSync(appFile, app, 'utf8');

console.log('\n✅ TODOS OS PATCHES APLICADOS');
