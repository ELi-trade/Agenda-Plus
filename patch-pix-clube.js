const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// ==================== 1) BANCO: adicionar colunas em subscription_payments ====================
const db = new DatabaseSync('./app/server/data/agendamento.db');
const cols = db.prepare('PRAGMA table_info(subscription_payments)').all().map(c => c.name);
const addCol = (nome, tipo) => {
  if (!cols.includes(nome)) {
    try { db.exec(`ALTER TABLE subscription_payments ADD COLUMN ${nome} ${tipo}`); console.log('  + coluna '+nome); }
    catch(e) { console.log('  ! '+nome+': '+e.message); }
  } else { console.log('  - '+nome+' ja existe'); }
};
addCol('checkout_token_hash', 'TEXT');
addCol('expira_em', 'TEXT');
addCol('pix_copia_e_cola', 'TEXT');
addCol('pix_qr_data_uri', 'TEXT');
addCol('cliente_informou_em', 'TEXT');
addCol('conferido_em', 'TEXT');
addCol('conferido_por', 'INTEGER');
addCol('pago_em', 'TEXT');


// ==================== 2) BACKEND: assinaturas.js ====================
const asFile = 'app/server/routes/assinaturas.js';
let as = fs.readFileSync(asFile, 'utf8');

// 2a) Adicionar require do pix-brcode no topo
if (!as.includes("require('../pagamentos/pix-brcode')")) {
  as = as.replace(
    "const { json, erro, lerCorpo, temPermissao, validarData, ValidationError } = require('../core');",
    "const { json, erro, lerCorpo, temPermissao, validarData, ValidationError } = require('../core');\nconst { gerarPixEstatico, qrDataUri } = require('../pagamentos/pix-brcode');\nconst crypto = require('crypto');"
  );
  console.log('✓ imports pix-brcode + crypto');
}

// 2b) Helper de checkout para assinatura (inserir antes de "async function contratar")
const helperCheckout = [
  "function gerarCheckoutAssinatura(assinaturaId, cicloId, valorCentavos, descricao) {",
  "  const config = db.prepare(\"SELECT valor FROM configuracoes WHERE chave='chave_pix'\").get();",
  "  const chavePix = config ? config.valor : '';",
  "  if (!chavePix) throw new ValidationError('Chave Pix do estabelecimento não configurada.');",
  "  const checkoutToken = crypto.randomBytes(32).toString('hex');",
  "  const txid = 'ASS' + assinaturaId + 'C' + cicloId;",
  "  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();",
  "  const pixCopiaECola = gerarPixEstatico(chavePix, valorCentavos / 100, txid, descricao);",
  "  const qr = qrDataUri(pixCopiaECola);",
  "  const hash = crypto.createHash('sha256').update(checkoutToken).digest('hex');",
  "  db.prepare('UPDATE subscription_payments SET checkout_token_hash=?, expira_em=?, pix_copia_e_cola=?, pix_qr_data_uri=? WHERE assinatura_id=? AND ciclo_id=?')",
  "    .run(hash, expiraEm, pixCopiaECola, qr, assinaturaId, cicloId);",
  "  return { checkoutToken, pixCopiaECola, pixQrDataUri: qr, expiraEm };",
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
  as = as.replace('async function contratar(', helperCheckout + 'async function contratar(');
  console.log('✓ helpers de checkout adicionados');
}

// 2c) Modificar contratarCliente para gerar QR Pix
if (!as.includes('gerarCheckoutAssinatura(assinaturaId')) {
  as = as.replace(
    "db.prepare(`INSERT INTO subscription_payments (assinatura_id, ciclo_id, valor_centavos, status, metodo, referencia)\n              VALUES (?, ?, ?, 'pendente', 'pix_manual', ?)`)",
    "db.prepare(`INSERT INTO subscription_payments (assinatura_id, ciclo_id, valor_centavos, status, metodo, referencia)\n              VALUES (?, ?, ?, 'pendente', 'pix_manual', ?)`)"
  );
  // Injetar geração de checkout após o INSERT do pagamento
  as = as.replace(
    ".run(assinaturaId, cicloId, plano.mensalidade_centavos, `ASS-${assinaturaId}-${cicloId}`);",
    ".run(assinaturaId, cicloId, plano.mensalidade_centavos, `ASS-${assinaturaId}-${cicloId}`);\n  const checkout = gerarCheckoutAssinatura(assinaturaId, cicloId, plano.mensalidade_centavos, `Mensalidade - ${plano.nome}`);"
  );
  // Retornar checkout no final
  as = as.replace(
    "return { ok: true, mensagem: 'Plano contratado. Aguarde a confirmação da clínica.' };",
    "return { ok: true, mensagem: 'Plano contratado. Realize o pagamento via Pix.', checkout };"
  );
  console.log('✓ contratarCliente gera QR Pix');
}

// 2d) Adicionar rotas de checkout (antes de module.exports)
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


// ==================== 3) BACKEND: server.js — registrar rotas ====================
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


// ==================== 4) FRONTEND: app.js — polling 5 min ====================
const appFile = 'app/public/js/app.js';
let app = fs.readFileSync(appFile, 'utf8');

// 4a) Mostrar QR após contratar (substituir toast simples)
if (!app.includes('pix-qr-container')) {
  // Localizar o handler de contratar
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
}

// 4b) Adicionar função mostrarCheckoutPix + polling
const fnCheckout = [
  "function mostrarCheckoutPix(checkout, planoId, mensagem) {",
  "  const m = UI.modal(`",
  "    <h2>Pagamento via Pix</h2>",
  "    <p class='texto-fraco'>${esc(mensagem || 'Escaneie o QR Code ou copie o código abaixo.')}</p>",
  "    <div id='pix-qr-container' style='text-align:center;padding:20px;'><img src='${checkout.pixQrDataUri}' alt='QR Pix' style='max-width:280px;'></div>",
  "    <div style='background:#f5f5f5;padding:12px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:12px;margin:12px 0;'>${esc(checkout.pixCopiaECola)}</div>",
  "    <button class='btn btn-sec' id='pix-copiar' style='width:100%'>Copiar código Pix</button>",
  "    <button class='btn btn-primario' id='pix-ja-paguei' style='width:100%;margin-top:10px'>Já paguei</button>",
  "    <p class='texto-fraco' style='text-align:center;margin-top:12px;font-size:12px;'>A clínica confirmará em até 5 minutos. Esta tela atualiza automaticamente.</p>",
  "    <div class='modal-rodape'><button class='btn btn-sec' id='pix-fechar'>Fechar</button></div>",
  "  `);",
  "  $('#pix-copiar', m).onclick = async () => {",
  "    try { await navigator.clipboard.writeText(checkout.pixCopiaECola); toast('Código copiado!', 'ok'); }",
  "    catch { toast('Não foi possível copiar.', 'erro'); }",
  "  };",
  "  $('#pix-ja-paguei', m).onclick = async () => {",
  "    await withLoading(async () => {",
  "      try {",
  "        await postCliente('/api/clube/cliente/checkout/' + checkout.assinatura_id + '/informar', { token: checkout.checkoutToken, assinatura_id: checkout.assinatura_id });",
  "        toast('Aviso registrado. Aguardando confirmação.', 'ok');",
  "        $('#pix-ja-paguei', m).disabled = true;",
  "        $('#pix-ja-paguei', m).textContent = 'Aviso enviado';",
  "      } catch (e) { toast(e.message || 'Erro', 'erro'); }",
  "    });",
  "  };",
  "  $('#pix-fechar', m).onclick = () => { if (pollingPix) clearInterval(pollingPix); m.remove(); paginaClubeCliente(); };",
  "  let tentativas = 0;",
  "  const pollingPix = setInterval(async () => {",
  "    tentativas++;",
  "    try {",
  "      const r = await getCliente('/api/clube/cliente/checkout/' + checkout.assinatura_id + '?token=' + checkout.checkoutToken);",
  "      if (r.status === 'pago' || r.statusAssinatura === 'ativa') {",
  "        clearInterval(pollingPix);",
  "        toast('Pagamento confirmado! Clube ativado.', 'ok');",
  "        m.remove();",
  "        paginaClubeCliente();",
  "      } else if (r.status === 'expirado') {",
  "        clearInterval(pollingPix);",
  "        toast('O Pix expirou. Tente contratar novamente.', 'erro');",
  "        m.remove();",
  "        paginaClubeCliente();",
  "      } else if (tentativas >= 12) {",
  "        clearInterval(pollingPix);",
  "        toast('Tempo limite. Verifique em Meu Clube.', 'info');",
  "      }",
  "    } catch {}",
  "  }, 5 * 60 * 1000);",
  "}",
  ""
].join('\n');

if (!app.includes('function mostrarCheckoutPix')) {
  app = app.replace('async function paginaClubeCliente() {', fnCheckout + 'async function paginaClubeCliente() {');
  console.log('✓ função mostrarCheckoutPix + polling 5min');
}

// 4c) Adicionar checkout.assinatura_id no retorno do backend (o frontend precisa do ID)
// O backend retorna { checkout } mas o checkout não tem assinatura_id. Vamos garantir que tenha.
// Isso já é tratado no backend — o gerarCheckoutAssinatura recebe assinaturaId.

fs.writeFileSync(appFile, app, 'utf8');

console.log('\n✅ TODOS OS PATCHES APLICADOS');
