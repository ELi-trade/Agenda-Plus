const fs = require('fs');

// ==================== 1) BACKEND: assinaturas.js ====================
const asFile = 'app/server/routes/assinaturas.js';
let as = fs.readFileSync(asFile, 'utf8');

// 1a) Adicionar require do pix-brcode no topo
if (!as.includes("require('../pagamentos/pix-brcode')")) {
  as = as.replace(
    "const { json, erro, lerCorpo, temPermissao, validarData, ValidationError } = require('../core');",
    "const { json, erro, lerCorpo, temPermissao, validarData, ValidationError } = require('../core');\nconst { gerarPixEstatico, qrDataUri } = require('../pagamentos/pix-brcode');\nconst crypto = require('crypto');"
  );
  console.log('✓ imports pix-brcode + crypto');
}

// 1b) Adicionar helper gerarCheckoutAssinatura (antes de contratarCliente)
const helperCheckout = [
  "function gerarCheckoutAssinatura(assinaturaId, cicloId, valorCentavos, descricao) {",
  "  const chavePix = process.env.PIX_CHAVE || '';",
  "  if (!chavePix) throw new Error('Chave Pix não configurada no .env');",
  "  const checkoutToken = crypto.randomBytes(32).toString('hex');",
  "  const txid = 'ASS' + assinaturaId + 'C' + cicloId;",
  "  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();",
  "  const pixCopiaECola = gerarPixEstatico(chavePix, valorCentavos / 100, txid, descricao);",
  "  const qr = qrDataUri(pixCopiaECola);",
  "  const hash = crypto.createHash('sha256').update(checkoutToken).digest('hex');",
  "  db.prepare('UPDATE subscription_payments SET checkout_token_hash=?, expira_em=?, pix_copia_e_cola=?, pix_qr_data_uri=? WHERE assinatura_id=? AND ciclo_id=?')",
  "    .run(hash, expiraEm, pixCopiaECola, qr, assinaturaId, cicloId);",
  "  return { checkoutToken, pixCopiaECola, pixQrDataUri: qr, expiraEm, assinatura_id: assinaturaId };",
  "}",
  "",
  "function consultarCheckoutAssinatura(token, assinaturaId) {",
  "  const hash = crypto.createHash('sha256').update(token).digest('hex');",
  "  const pg = db.prepare('SELECT * FROM subscription_payments WHERE assinatura_id=? AND checkout_token_hash=?').get(assinaturaId, hash);",
  "  if (!pg) return null;",
  "  if (pg.status === 'pendente' && !pg.cliente_informou_em && Date.now() >= Date.parse(pg.expira_em)) {",
  "    db.prepare(\"UPDATE subscription_payments SET status='expirado' WHERE id=? AND status='pendente'\").run(pg.id);",
  "    pg.status = 'expirado';",
  "  }",
  "  return pg;",
  "}",
  ""
].join('\n');

if (!as.includes('function gerarCheckoutAssinatura')) {
  as = as.replace('async function contratarCliente(', helperCheckout + 'async function contratarCliente(');
  console.log('✓ helpers de checkout adicionados');
}

// 1c) Modificar contratarCliente para gerar QR (âncora: linha 407)
if (!as.includes('gerarCheckoutAssinatura(assinaturaId, cicloId')) {
  as = as.replace(
    "json(res, 201, { id: assinaturaId, mensagem: 'Assinatura registrada. Confirme o pagamento da mensalidade para ativar os benefícios.' });",
    "const ciclo = db.prepare('SELECT id FROM subscription_cycles WHERE assinatura_id=? ORDER BY id DESC LIMIT 1').get(assinaturaId);\n  const checkout = gerarCheckoutAssinatura(assinaturaId, ciclo.id, plano.mensalidade_centavos, 'Mensalidade - ' + plano.nome);\n  json(res, 201, { id: assinaturaId, mensagem: 'Assinatura registrada. Realize o pagamento via Pix.', checkout });"
  );
  console.log('✓ contratarCliente gera QR Pix');
}

// 1d) Adicionar rotas de checkout (antes de module.exports)
const rotasCheckout = [
  "// ==================== Checkout Pix para assinaturas ====================",
  "async function consultarCheckout(req, res) {",
  "  const token = new URL(req.url, 'http://x').searchParams.get('token');",
  "  const assinaturaId = Number(req.url.split('/').pop());",
  "  if (!token || !assinaturaId) return erro(res, 400, 'Parâmetros inválidos.');",
  "  const pg = consultarCheckoutAssinatura(token, assinaturaId);",
  "  if (!pg) return erro(res, 404, 'Checkout não encontrado.');",
  "  const sub = db.prepare('SELECT status FROM subscriptions WHERE id=?').get(assinaturaId);",
  "  json(res, 200, {",
  "    status: pg.status,",
  "    statusAssinatura: sub ? sub.status : 'cancelada',",
  "    valor_centavos: pg.valor_centavos,",
  "    expira_em: pg.expira_em,",
  "    pix_copia_e_cola: pg.pix_copia_e_cola,",
  "    pix_qr_data_uri: pg.pix_qr_data_uri,",
  "    cliente_informou_em: pg.cliente_informou_em,",
  "  });",
  "}",
  "",
  "async function informarPagamentoAssinatura(req, res) {",
  "  const corpo = await lerCorpo(req);",
  "  const token = corpo.token;",
  "  const assinaturaId = Number(corpo.assinatura_id);",
  "  if (!token || !assinaturaId) return erro(res, 400, 'Parâmetros inválidos.');",
  "  const pg = consultarCheckoutAssinatura(token, assinaturaId);",
  "  if (!pg) return erro(res, 404, 'Checkout não encontrado.');",
  "  if (pg.status !== 'pendente') return erro(res, 409, 'Este checkout não está pendente.');",
  "  db.prepare(\"UPDATE subscription_payments SET cliente_informou_em=datetime('now') WHERE id=?\").run(pg.id);",
  "  json(res, 200, { ok: true, mensagem: 'Aviso registrado. A clínica confirmará em breve.' });",
  "}",
  "",
];

if (!as.includes('async function consultarCheckout(')) {
  as = as.replace('module.exports = {', rotasCheckout.join('\n') + 'module.exports = {');
  as = as.replace(
    'contratarCliente,',
    'contratarCliente, consultarCheckout, informarPagamentoAssinatura,'
  );
  console.log('✓ rotas de checkout adicionadas');
}

fs.writeFileSync(asFile, as, 'utf8');


// ==================== 2) BACKEND: server.js — registrar rotas ====================
const srvFile = 'app/server/server.js';
let srv = fs.readFileSync(srvFile, 'utf8');

if (!srv.includes('/api/clube/cliente/checkout')) {
  srv = srv.replace(
    "if (pathname === '/api/clube/cliente/cancelar' && metodo === 'POST') return club.cancelarCliente(req, res);",
    "if (pathname === '/api/clube/cliente/cancelar' && metodo === 'POST') return club.cancelarCliente(req, res);\n    const mCheckout = pathname.match(/^\\/api\\/clube\\/cliente\\/checkout\\/(\\d+)$/);\n    if (mCheckout && metodo === 'GET') return club.consultarCheckout(req, res, Number(mCheckout[1]));\n    if (mCheckout && metodo === 'POST') return club.informarPagamentoAssinatura(req, res);"
  );
  console.log('✓ rotas checkout no server.js');
}

fs.writeFileSync(srvFile, srv, 'utf8');


// ==================== 3) FRONTEND: app.js — handler contratar + botão voltar ====================
const appFile = 'app/public/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// 3a) Modificar handler de contratar para mostrar QR
const handlerAntigo = [
  "const r = await postCliente('/api/cliente/clube/contratar', { plano_id: Number(b.dataset.contratar) });",
  "toast(r.mensagem || 'Plano contratado!', 'ok');",
  "paginaClubeCliente();"
].join('\n');
const handlerNovo = [
  "const r = await postCliente('/api/cliente/clube/contratar', { plano_id: Number(b.dataset.contratar) });",
  "if (r.checkout) {",
  "  mostrarCheckoutPix(r.checkout, Number(b.dataset.contratar), r.mensagem);",
  "} else {",
  "  toast(r.mensagem || 'Plano contratado!', 'ok');",
  "  paginaClubeCliente();",
  "}"
].join('\n');
if (app.includes(handlerAntigo)) {
  app = app.replace(handlerAntigo, handlerNovo);
  console.log('✓ handler contratar atualizado');
}

// 3b) Adicionar botão voltar na tela de detalhes da assinatura (paginaContaCliente)
// Procurar onde termina a seção de agendamentos e adicionar botão voltar
if (!app.includes('btn-voltar-conta')) {
  app = app.replace(
    "'</main></div>';",
    "'<div style=\"margin-top:20px;text-align:center;\"><a class=\"btn btn-sec\" href=\"/#/minha-conta\">← Voltar</a></div></main></div>';"
  );
  console.log('✓ botão voltar adicionado');
}

fs.writeFileSync(appFile, app, 'utf8');

console.log('\n✅ TODOS OS PATCHES APLICADOS');
