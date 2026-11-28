'use strict';
// Clube de Assinaturas — direitos de utilização de serviços por ciclo mensal.
// Não é carteira: o cliente paga a mensalidade e recebe quantidades de serviços.

const { db, hashSenha } = require('../db/database');
const { json, erro, lerCorpo, temPermissao, validarData, ValidationError } = require('../core');
const { gerarPixEstatico, qrDataUri } = require('../pagamentos/pix-brcode');
const crypto = require('crypto');

// ==================== Utilidades ====================
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function somarMeses(iso, meses) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const alvoAno = ano + Math.floor((mes - 1 + meses) / 12);
  const alvoMes = ((mes - 1 + meses) % 12 + 12) % 12 + 1;
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes, 0)).getUTCDate();
  const alvoDia = Math.min(dia, ultimoDia);
  return `${alvoAno}-${String(alvoMes).padStart(2, '0')}-${String(alvoDia).padStart(2, '0')}`;
}
function auditar(acao, { usuarioId = null, clienteId = null, entidade = null, entidadeId = null, detalhes = null } = {}) {
  db.prepare('INSERT INTO subscription_audit_logs (usuario_id, cliente_id, acao, entidade, entidade_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(usuarioId, clienteId, acao, entidade, entidadeId, detalhes ? JSON.stringify(detalhes) : null);
}

// ==================== Ciclos / benefícios ====================
function obterPlanoItens(planoId) {
  return db.prepare(`
    SELECT i.*, s.nome AS servico, s.preco_centavos
    FROM subscription_plan_items i JOIN servicos s ON s.id = i.servico_id
    WHERE i.plano_id = ? ORDER BY s.nome
  `).all(planoId);
}
function resumoPlano(plano) {
  const itens = obterPlanoItens(plano.id);
  const avulso = itens.reduce((s, i) => s + i.preco_centavos * i.quantidade, 0);
  const economia = avulso > plano.mensalidade_centavos ? avulso - plano.mensalidade_centavos : null;
  return { ...plano, itens, avulso_centavos: avulso, economia_centavos: economia };
}
function criarCiclo(assinaturaId, plano, inicio) {
  const fim = somarMeses(inicio, 1);
  const info = db.prepare('INSERT INTO subscription_cycles (assinatura_id, inicio_em, fim_em, status) VALUES (?, ?, ?, ?)')
    .run(assinaturaId, inicio, fim, 'aguardando_pagamento');
  const cicloId = info.lastInsertRowid;
  for (const item of obterPlanoItens(plano.id)) {
    db.prepare('INSERT INTO subscription_entitlements (ciclo_id, servico_id, quantidade) VALUES (?, ?, ?)')
      .run(cicloId, item.servico_id, item.quantidade);
  }
  db.prepare(`INSERT INTO subscription_payments (assinatura_id, ciclo_id, valor_centavos, status, metodo, referencia)
              VALUES (?, ?, ?, 'pendente', 'pix_manual', ?)`)
    .run(assinaturaId, cicloId, plano.mensalidade_centavos, `CICLO-${cicloId}`);
  return db.prepare('SELECT * FROM subscription_cycles WHERE id = ?').get(cicloId);
}
function cicloAtivo(assinaturaId) {
  return db.prepare(`
    SELECT * FROM subscription_cycles WHERE assinatura_id = ? ORDER BY id DESC LIMIT 1
  `).get(assinaturaId) || null;
}
function entCiclo(cicloId, servicoId) {
  return db.prepare('SELECT * FROM subscription_entitlements WHERE ciclo_id = ? AND servico_id = ?').get(cicloId, servicoId) || null;
}

// Avalia o que o cliente tem direito num serviço: uso incluído ou desconto adicional.
function elegibilidade(clienteId, servicoId) {
  const assinatura = db.prepare(`
    SELECT su.*, sp.desconto_adicional_pct, sp.nome AS plano, sp.mensalidade_centavos
    FROM subscriptions su JOIN subscription_plans sp ON sp.id = su.plano_id
    WHERE su.cliente_id = ? AND su.status = 'ativa' ORDER BY su.id DESC LIMIT 1
  `).get(clienteId);
  if (!assinatura) return { assinatura: null, tipo: 'sem_plano' };
  const ciclo = cicloAtivo(assinatura.id);
  if (!ciclo || ciclo.status !== 'ativo') return { assinatura, ciclo, tipo: 'sem_ciclo' };
  const ent = entCiclo(ciclo.id, servicoId);
  const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(servicoId);
  if (ent && ent.usados + ent.reservados < ent.quantidade) {
    return { assinatura, ciclo, ent, servico, tipo: 'incluido', restantes: ent.quantidade - ent.usados - ent.reservados };
  }
  if (assinatura.desconto_adicional_pct > 0 && servico) {
    return {
      assinatura, ciclo, ent, servico, tipo: 'desconto', pct: assinatura.desconto_adicional_pct,
      preco_original_centavos: servico.preco_centavos,
      preco_final_centavos: Math.round(servico.preco_centavos * (1 - assinatura.desconto_adicional_pct / 100))
    };
  }
  return { assinatura, ciclo, ent, servico, tipo: 'sem_beneficio' };
}

// Reserva temporária (agendamento pendente/confirmado) — atômica: UPDATE condicional + registro de uso numa única transação.
function reservar(cicloId, servicoId, clienteId, agendamentoId) {
  db.transaction(() => {
    const r = db.prepare(`
      UPDATE subscription_entitlements SET reservados = reservados + 1
      WHERE ciclo_id = ? AND servico_id = ? AND usados + reservados < quantidade
    `).run(cicloId, servicoId);
    if (!r.changes) throw new ValidationError('Benefício indisponível para este serviço neste ciclo.');
    db.prepare(`INSERT INTO subscription_usage (entitlement_id, agendamento_id, cliente_id, servico_id, acao, detalhes)
                VALUES (?, ?, ?, ?, 'reservado', ?)`)
      .run(db.prepare('SELECT id FROM subscription_entitlements WHERE ciclo_id=? AND servico_id=?').get(cicloId, servicoId).id,
        agendamentoId, clienteId, servicoId, JSON.stringify({ agendamento_id: agendamentoId }));
  })();
}
// Confirma o consumo definitivo (após finalizado).
function consumir(agendamentoId) {
  const uso = db.prepare(`SELECT * FROM subscription_usage WHERE agendamento_id = ? AND acao = 'reservado' ORDER BY id DESC LIMIT 1`).get(agendamentoId);
  if (!uso) return false;
  const ent = db.prepare('SELECT * FROM subscription_entitlements WHERE id = ?').get(uso.entitlement_id);
  db.prepare(`UPDATE subscription_entitlements SET reservados = MAX(0, reservados - 1), usados = usados + 1 WHERE id = ?`).run(ent.id);
  db.prepare(`UPDATE subscription_usage SET acao = 'consumido', detalhes = ? WHERE id = ?`)
    .run(JSON.stringify({ consumido_em: hojeISO() }), uso.id);
  return true;
}
// Libera a reserva (cancelamento permitido).
function liberar(agendamentoId) {
  const usos = db.prepare(`SELECT * FROM subscription_usage WHERE agendamento_id = ? AND acao IN ('reservado','consumido')`).all(agendamentoId);
  for (const uso of usos) {
    const ent = db.prepare('SELECT * FROM subscription_entitlements WHERE id = ?').get(uso.entitlement_id);
    const devolveuReserva = uso.acao === 'reservado';
    if (devolveuReserva) {
      db.prepare('UPDATE subscription_entitlements SET reservados = MAX(0, reservados - 1) WHERE id = ?').run(ent.id);
    } else {
      db.prepare('UPDATE subscription_entitlements SET usados = MAX(0, usados - 1) WHERE id = ?').run(ent.id);
    }
    db.prepare(`UPDATE subscription_usage SET acao = 'liberado', detalhes = ? WHERE id = ?`)
      .run(JSON.stringify({ liberado_em: hojeISO(), devolveu: devolveuReserva ? 'reserva' : 'consumo' }), uso.id);
  }
  return usos.length > 0;
}
// Ajuste manual de uso: admin registra ou devolve uma utilização fora da agenda.
function ajustarUso(assinaturaId, entitlementId, acao, usuarioId) {
  const ent = db.prepare(`
    SELECT e.* FROM subscription_entitlements e
    JOIN subscription_cycles c ON c.id = e.ciclo_id
    WHERE e.id = ? AND c.assinatura_id = ?
  `).get(Number(entitlementId), Number(assinaturaId));
  if (!ent) throw new ValidationError('Benefício não encontrado nesta assinatura.');
  if (acao === 'consumir') {
    if (ent.usados + ent.reservados >= ent.quantidade) throw new ValidationError('Sem saldo disponível para este serviço neste ciclo.');
    db.prepare('UPDATE subscription_entitlements SET usados = usados + 1 WHERE id = ?').run(ent.id);
  } else {
    if (ent.usados <= 0) throw new ValidationError('Nenhuma utilização para devolver neste serviço.');
    db.prepare('UPDATE subscription_entitlements SET usados = usados - 1 WHERE id = ?').run(ent.id);
  }
  db.prepare(`INSERT INTO subscription_usage (entitlement_id, cliente_id, servico_id, acao, detalhes)
              VALUES (?, ?, ?, ?, ?)`)
    .run(ent.id, entCicloCliente(assinaturaId), ent.servico_id,
      acao === 'consumir' ? 'consumido' : 'liberado',
      JSON.stringify({ manual: true, por: usuarioId }));
  const atual = db.prepare('SELECT * FROM subscription_entitlements WHERE id = ?').get(ent.id);
  auditar(acao === 'consumir' ? 'uso_manual' : 'devolucao_manual', { usuarioId, entidade: 'entitlement', entidadeId: ent.id, detalhes: { usados: atual.usados } });
  return atual;
}
function entCicloCliente(assinaturaId) {
  const a = db.prepare('SELECT cliente_id FROM subscriptions WHERE id = ?').get(assinaturaId);
  return a ? a.cliente_id : null;
}
// Checkout Pix de um ciclo, para o admin conferir/encaminhar ao cliente.
function checkoutPixAdmin(assinaturaId) {
  const ciclo = cicloAtivo(assinaturaId);
  if (!ciclo || ciclo.status !== 'aguardando_pagamento') return null;
  const pg = db.prepare(`SELECT * FROM subscription_payments WHERE assinatura_id = ? AND ciclo_id = ? AND status = 'pendente' ORDER BY id DESC LIMIT 1`).get(assinaturaId, ciclo.id);
  if (pg && pg.pix_qr_data_uri) return pg;
  const plano = db.prepare(`SELECT sp.* FROM subscription_plans sp JOIN subscriptions su ON su.plano_id = sp.id WHERE su.id = ?`).get(assinaturaId);
  if (!plano) return null;
  const gerado = gerarCheckoutAssinatura(assinaturaId, ciclo.id, plano.mensalidade_centavos, 'Mensalidade ' + plano.nome + ' - ciclo ' + ciclo.id);
  return db.prepare('SELECT * FROM subscription_payments WHERE assinatura_id=? AND ciclo_id=? AND status=?').get(assinaturaId, ciclo.id, 'pendente') || gerado;
}
function pagarCiclo(cicloId, usuarioId) {
  const ciclo = db.prepare('SELECT * FROM subscription_cycles WHERE id = ?').get(cicloId);
  if (!ciclo) throw new ValidationError('Ciclo não encontrado');
  db.prepare(`UPDATE subscription_payments SET status='pago', pago_em=?, confirmado_por=?, atualizado_em=datetime('now') WHERE ciclo_id=? AND status='pendente'`)
    .run(hojeISO(), usuarioId, cicloId);
  db.prepare(`UPDATE subscription_cycles SET status='ativo' WHERE id=? AND status='aguardando_pagamento'`).run(cicloId);
  const assinatura = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(ciclo.assinatura_id);
  if (assinatura && assinatura.status === 'pendente') {
    db.prepare(`UPDATE subscriptions SET status='ativa', inicio_em=?, atualizado_em=datetime('now') WHERE id=?`).run(ciclo.inicio_em, assinatura.id);
  }
  auditar('pagamento_confirmado', { usuarioId, entidade: 'ciclo', entidadeId: cicloId });
}

// ==================== CRUD Planos ====================
async function listarPlanos(_req, res) {
  json(res, 200, db.prepare('SELECT * FROM subscription_plans ORDER BY ativo DESC, mensalidade_centavos').all().map(resumoPlano));
}
async function salvarPlano(req, res, usuario, id = null) {
  const c = await lerCorpo(req);
  if (!c.nome || !Number(c.mensalidade_centavos > 0 || c.mensalidade)) {
    return erro(res, 400, 'Informe nome e mensalidade do plano.');
  }
  const mensalidade = Math.round(Number(c.mensalidade_centavos || 0) || Math.round(Number(c.mensalidade || 0) * 100));
  if (!(mensalidade > 0)) return erro(res, 400, 'Mensalidade inválida.');
  const pct = Math.max(0, Math.min(100, Number(c.desconto_adicional_pct || 0)));
  const validade = Math.max(1, Number(c.validade_beneficios_dias || 31));
  const transferir = c.transferir_expirados ? 1 : 0;
  const cancelamentoDias = Math.max(0, Number(c.cancelamento_dias || 0));
  const itens = Array.isArray(c.itens) ? c.itens : [];
  for (const item of itens) {
    if (!db.prepare('SELECT id FROM servicos WHERE id = ?').get(Number(item.servico_id))) {
      return erro(res, 400, `Serviço ${item.servico_id} não encontrado no catálogo.`);
    }
    if (!(Number(item.quantidade) > 0)) return erro(res, 400, 'Quantidade dos itens deve ser maior que zero.');
  }
  db.transaction(() => {
    let planoId = id;
    if (id) {
      db.prepare(`UPDATE subscription_plans SET nome=?, descricao=?, mensalidade_centavos=?, desconto_adicional_pct=?,
        validade_beneficios_dias=?, transferir_expirados=?, cancelamento_dias=?, atualizado_em=datetime('now') WHERE id=?`)
        .run(String(c.nome).trim(), c.descricao ? String(c.descricao).trim() : null, mensalidade, pct, validade, transferir, cancelamentoDias, id);
      db.prepare('DELETE FROM subscription_plan_items WHERE plano_id = ?').run(id);
    } else {
      planoId = db.prepare(`INSERT INTO subscription_plans (nome, descricao, mensalidade_centavos, desconto_adicional_pct,
        validade_beneficios_dias, transferir_expirados, cancelamento_dias) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(String(c.nome).trim(), c.descricao ? String(c.descricao).trim() : null, mensalidade, pct, validade, transferir, cancelamentoDias).lastInsertRowid;
    }
    for (const item of itens) {
      db.prepare('INSERT INTO subscription_plan_items (plano_id, servico_id, quantidade) VALUES (?, ?, ?)')
        .run(planoId, Number(item.servico_id), Number(item.quantidade));
    }
    auditar(id ? 'plano_editado' : 'plano_criado', { usuarioId: usuario.id, entidade: 'plano', entidadeId: planoId, detalhes: { nome: c.nome, mensalidade } });
  })();
  json(res, id ? 200 : 201, { id: Number(id || db.prepare('SELECT id FROM subscription_plans ORDER BY id DESC LIMIT 1').get().id) });
}
async function ativarPlano(req, res, usuario, id) {
  const c = await lerCorpo(req);
  const ativo = c.ativo ? 1 : 0;
  db.prepare(`UPDATE subscription_plans SET ativo=?, atualizado_em=datetime('now') WHERE id=?`).run(ativo, id);
  auditar(ativo ? 'plano_ativado' : 'plano_desativado', { usuarioId: usuario.id, entidade: 'plano', entidadeId: Number(id) });
  json(res, 200, { ok: true, ativo: !!ativo });
}
async function excluirPlano(req, res, usuario, id) {
  const assinantes = db.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE plano_id = ? AND status IN ('ativa','pendente','cancelamento_solicitado')`).get(id).n;
  if (assinantes > 0) return erro(res, 409, 'Este plano tem assinantes ativos. Desative-o em vez de excluir.');
  db.transaction(() => {
    db.prepare('DELETE FROM subscription_plan_items WHERE plano_id = ?').run(id);
    db.prepare('DELETE FROM subscription_plans WHERE id = ?').run(id);
    auditar('plano_excluido', { usuarioId: usuario.id, entidade: 'plano', entidadeId: Number(id) });
  })();
  json(res, 200, { ok: true });
}

// ==================== Assinantes ====================
function dadosAssinatura(id) {
  const assinatura = db.prepare(`
    SELECT su.*, c.nome AS cliente, c.telefone, c.email, sp.nome AS plano, sp.mensalidade_centavos,
           sp.desconto_adicional_pct, sp.cancelamento_dias, sp.validade_beneficios_dias
    FROM subscriptions su JOIN clientes c ON c.id = su.cliente_id JOIN subscription_plans sp ON sp.id = su.plano_id
    WHERE su.id = ?
  `).get(id);
  if (!assinatura) return null;
  const ciclo = cicloAtivo(assinatura.id);
  const beneficios = ciclo ? db.prepare(`
    SELECT e.*, s.nome AS servico, s.preco_centavos
    FROM subscription_entitlements e JOIN servicos s ON s.id = e.servico_id
    WHERE e.ciclo_id = ? ORDER BY s.nome
  `).all(ciclo.id) : [];
  const pagamentos = db.prepare(`
    SELECT p.*, cy.inicio_em AS ciclo_inicio, cy.fim_em AS ciclo_fim
    FROM subscription_payments p LEFT JOIN subscription_cycles cy ON cy.id = p.ciclo_id
    WHERE p.assinatura_id = ? ORDER BY p.id DESC
  `).all(id);
  const uso = db.prepare(`
    SELECT u.*, s.nome AS servico, a.data AS ag_data, a.hora_inicio, a.status AS ag_status
    FROM subscription_usage u JOIN servicos s ON s.id = u.servico_id
    LEFT JOIN agendamentos a ON a.id = u.agendamento_id
    WHERE u.cliente_id = ? ORDER BY u.id DESC LIMIT 50
  `).all(assinatura.cliente_id);
  return { ...assinatura, ciclo, beneficios, pagamentos, utilizacao: uso };
}
async function listarAssinaturas(_req, res) {
  json(res, 200, db.prepare(`
    SELECT su.id, su.status, su.inicio_em, su.cancelada_em, c.nome AS cliente, c.telefone, c.email,
           sp.nome AS plano, sp.mensalidade_centavos, sp.desconto_adicional_pct
    FROM subscriptions su JOIN clientes c ON c.id = su.cliente_id JOIN subscription_plans sp ON sp.id = su.plano_id
    ORDER BY su.status, sp.nome, c.nome
  `).all());
}
async function obterAssinatura(_req, res, _u, id) {
  const a = dadosAssinatura(Number(id));
  if (!a) return erro(res, 404, 'Assinatura não encontrada');
  json(res, 200, a);
}
function gerarCheckoutAssinatura(assinaturaId, cicloId, valorCentavos, descricao) {
  const config = db.prepare("SELECT valor FROM configuracoes WHERE chave='chave_pix'").get();
  const chavePix = config ? config.valor : '';
  if (!chavePix) throw new ValidationError('Chave Pix do estabelecimento não configurada.');
  const checkoutToken = crypto.randomBytes(32).toString('hex');
  const txid = 'ASS' + assinaturaId + 'C' + cicloId;
  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const pixCopiaECola = gerarPixEstatico(chavePix, valorCentavos / 100, txid, descricao);
  const qr = qrDataUri(pixCopiaECola);
  const hash = crypto.createHash('sha256').update(checkoutToken).digest('hex');
  db.prepare('UPDATE subscription_payments SET checkout_token_hash=?, expira_em=?, pix_copia_e_cola=?, pix_qr_data_uri=? WHERE assinatura_id=? AND ciclo_id=?')
    .run(hash, expiraEm, pixCopiaECola, qr, assinaturaId, cicloId);
  return { checkoutToken, pixCopiaECola, pixQrDataUri: qr, expiraEm };
}

function consultarCheckoutAssinatura(token, assinaturaId) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const pg = db.prepare('SELECT * FROM subscription_payments WHERE assinatura_id=? AND checkout_token_hash=?').get(assinaturaId, hash);
  if (!pg) return null;
  if (pg.status === 'pendente' && !pg.cliente_informou_em && Date.now() >= Date.parse(pg.expira_em)) {
    db.prepare("UPDATE subscription_payments SET status='expirado' WHERE id=? AND status='pendente'").run(pg.id);
    pg.status = 'expirado';
  }
  return pg;
}
async function contratar(req, res, usuario) {
  const c = await lerCorpo(req);
  const plano = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND ativo = 1').get(Number(c.plano_id));
  if (!plano) return erro(res, 404, 'Plano não encontrado ou inativo');
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ? AND ativo = 1').get(Number(c.cliente_id));
  if (!cliente) return erro(res, 404, 'Cliente não encontrado');
  const existente = db.prepare(`SELECT id, status FROM subscriptions WHERE cliente_id = ? AND plano_id = ?`).get(cliente.id, plano.id);
  if (existente && ['ativa', 'pendente', 'cancelamento_solicitado'].includes(existente.status)) {
    return erro(res, 409, 'Este cliente já possui esta assinatura.');
  }
  const inicio = validarData(c.inicio_em) ? c.inicio_em : hojeISO();
  let assinaturaId = existente ? existente.id : null;
  db.transaction(() => {
    if (!assinaturaId) {
      assinaturaId = db.prepare(`INSERT INTO subscriptions (plano_id, cliente_id, status) VALUES (?, ?, 'pendente')`)
        .run(plano.id, cliente.id).lastInsertRowid;
    } else {
      db.prepare(`UPDATE subscriptions SET status='pendente', cancelada_em=NULL, cancelamento_motivo=NULL, atualizado_em=datetime('now') WHERE id=?`).run(assinaturaId);
    }
    criarCiclo(assinaturaId, plano, inicio);
    auditar('assinatura_contratada', { usuarioId: usuario.id, clienteId: cliente.id, entidade: 'assinatura', entidadeId: assinaturaId, detalhes: { plano: plano.nome, inicio } });
  })();
  json(res, 201, { id: assinaturaId });
}
async function alterarStatusAssinatura(req, res, usuario, id) {
  const c = await lerCorpo(req);
  const permitidos = ['pendente', 'ativa', 'cancelada', 'cancelamento_solicitado', 'expirada'];
  if (!permitidos.includes(c.status)) return erro(res, 400, 'Status inválido.');
  const atual = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  if (!atual) return erro(res, 404, 'Assinatura não encontrada');
  db.prepare(`UPDATE subscriptions SET status=?, cancelada_em=?, cancelamento_motivo=?, atualizado_em=datetime('now') WHERE id=?`)
    .run(c.status, c.status === 'cancelada' ? hojeISO() : atual.cancelada_em, c.motivo ?? atual.cancelamento_motivo, id);
  auditar('assinatura_status', { usuarioId: usuario.id, entidade: 'assinatura', entidadeId: Number(id), detalhes: { de: atual.status, para: c.status } });
  json(res, 200, { ok: true, status: c.status });
}
async function confirmarPagamento(req, res, usuario, cicloId) {
  try { pagarCiclo(Number(cicloId), usuario.id); }
  catch (e) { return erro(res, e instanceof ValidationError ? 400 : 500, e.message); }
  json(res, 200, { ok: true });
}
// Confirma o pagamento pelo id da ASSINATURA (usa o ciclo aguardando pagamento mais recente).
async function confirmarPagamentoAssinatura(req, res, usuario, assinaturaId) {
  const ciclo = cicloAtivo(Number(assinaturaId));
  if (!ciclo) return erro(res, 404, 'Nenhum ciclo para esta assinatura.');
  if (ciclo.status !== 'aguardando_pagamento') return erro(res, 409, 'Este ciclo não está aguardando pagamento.');
  try { pagarCiclo(ciclo.id, usuario.id); }
  catch (e) { return erro(res, e instanceof ValidationError ? 400 : 500, e.message); }
  json(res, 200, { ok: true, mensagem: 'Pagamento confirmado e ciclo ativado.' });
}
// GET /api/clube/assinaturas/:id/pix — QR Pix do ciclo pendente para conferência do admin.
async function obterPixAssinatura(req, res, _u, assinaturaId) {
  try {
    const pg = checkoutPixAdmin(Number(assinaturaId));
    if (!pg) return erro(res, 404, 'Nenhum pagamento Pix pendente para esta assinatura.');
    json(res, 200, {
      valor_centavos: pg.valor_centavos,
      pix_copia_e_cola: pg.pix_copia_e_cola,
      pix_qr_data_uri: pg.pix_qr_data_uri,
      expira_em: pg.expira_em,
      cliente_informou_em: pg.cliente_informou_em,
      status: pg.status,
    });
  } catch (e) { return erro(res, e instanceof ValidationError ? 400 : 500, e.message); }
}
// POST /api/clube/assinaturas/:id/uso { entitlement_id, acao: 'consumir'|'devolver' }
async function ajustarUsoRota(req, res, usuario, assinaturaId) {
  const c = await lerCorpo(req);
  if (!['consumir', 'devolver'].includes(c.acao)) return erro(res, 400, 'Ação inválida.');
  try {
    const ent = ajustarUso(Number(assinaturaId), c.entitlement_id, c.acao, usuario.id);
    json(res, 200, { ok: true, usados: ent.usados, reservados: ent.reservados, quantidade: ent.quantidade });
  } catch (e) { return erro(res, e instanceof ValidationError ? 400 : 500, e.message); }
}
async function indicadores(_req, res) {
  const ativosPorPlano = db.prepare(`
    SELECT sp.nome AS plano, COUNT(*) AS total
    FROM subscriptions su JOIN subscription_plans sp ON sp.id = su.plano_id
    WHERE su.status = 'ativa' GROUP BY sp.id ORDER BY total DESC
  `).all();
  const mrr = db.prepare(`
    SELECT COALESCE(SUM(sp.mensalidade_centavos), 0) AS total
    FROM subscriptions su JOIN subscription_plans sp ON sp.id = su.plano_id
    WHERE su.status = 'ativa'
  `).get().total;
  const recebido = db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) AS t FROM subscription_payments WHERE status='pago'`).get().t;
  const pendentes = db.prepare(`SELECT COUNT(*) AS n FROM subscription_payments WHERE status='pendente'`).get().n;
  const canceladas = db.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('cancelada','cancelamento_solicitado')`).get().n;
  const maisUsados = db.prepare(`
    SELECT s.nome AS servico, COUNT(*) AS vezes
    FROM subscription_usage u JOIN servicos s ON s.id = u.servico_id
    WHERE u.acao = 'consumido' GROUP BY s.id ORDER BY vezes DESC LIMIT 10
  `).all();
  const usados = db.prepare(`SELECT COALESCE(SUM(usados),0) AS t FROM subscription_entitlements`).get().t;
  const disponiveis = db.prepare(`SELECT COALESCE(SUM(quantidade - usados - reservados),0) AS t FROM subscription_entitlements WHERE ciclo_id IN (SELECT id FROM subscription_cycles WHERE status='ativo')`).get().t;
  json(res, 200, {
    assinantes_ativos: ativosPorPlano.reduce((s, p) => s + p.total, 0),
    por_plano: ativosPorPlano,
    mrr_contratado_centavos: mrr,
    receita_recebida_centavos: recebido,
    pagamentos_pendentes: pendentes,
    assinaturas_canceladas: canceladas,
    servicos_mais_utilizados: maisUsados,
    beneficios_usados: usados,
    beneficios_disponiveis: disponiveis,
  });
}

// ==================== Público (agendamento online) ====================
async function planosPublicos(_req, res) {
  json(res, 200, db.prepare('SELECT * FROM subscription_plans WHERE ativo = 1 ORDER BY mensalidade_centavos').all().map(resumoPlano));
}

// ==================== Área do cliente ====================
function assinaturaDoCliente(clienteId) {
  const a = db.prepare(`
    SELECT su.*, sp.nome AS plano, sp.descricao AS plano_descricao, sp.mensalidade_centavos,
           sp.desconto_adicional_pct, sp.cancelamento_dias, sp.validade_beneficios_dias
    FROM subscriptions su JOIN subscription_plans sp ON sp.id = su.plano_id
    WHERE su.cliente_id = ? AND su.status IN ('pendente','ativa','cancelamento_solicitado')
    ORDER BY su.id DESC LIMIT 1
  `).get(clienteId);
  if (!a) return null;
  const ciclo = cicloAtivo(a.id);
  const beneficios = ciclo ? db.prepare(`
    SELECT e.*, s.nome AS servico, s.preco_centavos
    FROM subscription_entitlements e JOIN servicos s ON s.id = e.servico_id
    WHERE e.ciclo_id = ? ORDER BY s.nome
  `).all(ciclo.id) : [];
  const utilizacao = db.prepare(`
    SELECT u.*, s.nome AS servico, a.data AS ag_data, a.hora_inicio
    FROM subscription_usage u JOIN servicos s ON s.id = u.servico_id
    LEFT JOIN agendamentos a ON a.id = u.agendamento_id
    WHERE u.cliente_id = ? ORDER BY u.id DESC LIMIT 50
  `).all(clienteId);
  return {
    ...a, ciclo, beneficios, utilizacao,
    pagamento: db.prepare(`SELECT * FROM subscription_payments WHERE assinatura_id=? ORDER BY id DESC LIMIT 1`).get(a.id),
  };
}
async function clubeCliente(req, res) {
  const { clienteDaRequisicao } = require('../core');
  const cliente = clienteDaRequisicao(req);
  if (!cliente) return erro(res, 401, 'Acesso de cliente expirado.');
  json(res, 200, {
    planos: db.prepare('SELECT * FROM subscription_plans WHERE ativo = 1 ORDER BY mensalidade_centavos').all().map(resumoPlano),
    assinatura: assinaturaDoCliente(cliente.id),
  });
}
async function contratarCliente(req, res) {
  const { clienteDaRequisicao } = require('../core');
  const cliente = clienteDaRequisicao(req);
  if (!cliente) return erro(res, 401, 'Acesso de cliente expirado.');
  const c = await lerCorpo(req);
  const plano = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND ativo = 1').get(Number(c.plano_id));
  if (!plano) return erro(res, 404, 'Plano não encontrado ou inativo.');
  const existente = db.prepare(`SELECT id, status FROM subscriptions WHERE cliente_id = ? AND plano_id = ?`).get(cliente.id, plano.id);
  if (existente && ['ativa', 'pendente', 'cancelamento_solicitado'].includes(existente.status)) {
    return erro(res, 409, 'Você já possui este plano.');
  }
  const inicio = hojeISO();
  let assinaturaId = existente ? existente.id : null;
  let ciclo = null;
  db.transaction(() => {
    if (!assinaturaId) {
      assinaturaId = db.prepare(`INSERT INTO subscriptions (plano_id, cliente_id, status) VALUES (?, ?, 'pendente')`)
        .run(plano.id, cliente.id).lastInsertRowid;
    } else {
      db.prepare(`UPDATE subscriptions SET status='pendente', cancelada_em=NULL, atualizado_em=datetime('now') WHERE id=?`).run(assinaturaId);
    }
    ciclo = criarCiclo(assinaturaId, plano, inicio);
    auditar('contratacao_cliente', { clienteId: cliente.id, entidade: 'assinatura', entidadeId: assinaturaId, detalhes: { plano: plano.nome } });
  })();
  // Gera o checkout Pix imediatamente para que o cliente pague a mensalidade do primeiro ciclo.
  let checkout = null;
  try {
    checkout = gerarCheckoutAssinatura(assinaturaId, ciclo.id, plano.mensalidade_centavos, 'Mensalidade ' + plano.nome + ' - ciclo ' + ciclo.id);
  } catch (e) {
    // Sem chave Pix configurada o cliente ainda pode contratar; a clínica registra o pagamento manualmente.
  }
  json(res, 201, {
    id: assinaturaId,
    mensagem: 'Assinatura registrada. Pague a mensalidade via Pix para ativar os benefícios.',
    checkout: checkout ? { ...checkout, assinatura_id: assinaturaId } : null,
  });
}
async function cancelarCliente(req, res) {
  const { clienteDaRequisicao } = require('../core');
  const cliente = clienteDaRequisicao(req);
  if (!cliente) return erro(res, 401, 'Acesso de cliente expirado.');
  const c = await lerCorpo(req);
  const a = db.prepare(`
    SELECT su.*, sp.cancelamento_dias, sp.nome AS plano FROM subscriptions su
    JOIN subscription_plans sp ON sp.id = su.plano_id
    WHERE su.id = ? AND su.cliente_id = ? AND su.status IN ('ativa','pendente','cancelamento_solicitado')
  `).get(Number(c.assinatura_id), cliente.id);
  if (!a) return erro(res, 404, 'Assinatura não encontrada.');
  if (a.status === 'pendente') {
    db.prepare(`UPDATE subscriptions SET status='cancelada', cancelada_em=?, cancelamento_motivo=?, atualizado_em=datetime('now') WHERE id=?`)
      .run(hojeISO(), 'Cancelada antes do primeiro pagamento', a.id);
    auditar('cancelamento_cliente', { clienteId: cliente.id, entidade: 'assinatura', entidadeId: a.id, detalhes: { quando: 'pendente' } });
    return json(res, 200, { ok: true, mensagem: 'Assinatura cancelada.' });
  }
  db.prepare(`UPDATE subscriptions SET status='cancelamento_solicitado', atualizado_em=datetime('now') WHERE id=?`).run(a.id);
  auditar('cancelamento_solicitado', { clienteId: cliente.id, entidade: 'assinatura', entidadeId: a.id, detalhes: { plano: a.plano } });
  json(res, 200, { ok: true, mensagem: `Solicitação registrada. A clínica vai confirmar o cancelamento${a.cancelamento_dias > 0 ? ` (aviso mínimo de ${a.cancelamento_dias} dia(s))` : ''}.` });
}

// ==================== Integração com agendamentos ====================
// Chamada por agendamentos.js quando um agendamento usa ou libera benefício.
function aoCriarAgendamento(agendamento) {
  const e = elegibilidade(agendamento.cliente_id, agendamento.servico_id);
  if (e.tipo !== 'incluido') return { tipo: e.tipo === 'desconto' ? 'desconto' : 'sem_beneficio', ...e };
  reservar(e.ciclo.id, agendamento.servico_id, agendamento.cliente_id, agendamento.id);
  return { tipo: 'incluido', cicloId: e.ciclo.id, restantes: e.restantes - 1 };
}
function aoFinalizarAgendamento(agendamentoId) { return consumir(agendamentoId); }
function aoCancelarAgendamento(agendamentoId) { return liberar(agendamentoId); }

// ==================== Checkout Pix para assinaturas ====================
async function consultarCheckout(req, res) {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const assinaturaId = Number(req.url.split('/').pop());
  if (!token || !assinaturaId) return erro(res, 400, 'Parâmetros inválidos.');
  const pg = consultarCheckoutAssinatura(token, assinaturaId);
  if (!pg) return erro(res, 404, 'Checkout não encontrado.');
  const sub = db.prepare('SELECT status FROM subscriptions WHERE id=?').get(assinaturaId);
  json(res, 200, {
    status: pg.status,
    statusAssinatura: sub ? sub.status : 'cancelada',
    valor_centavos: pg.valor_centavos,
    expira_em: pg.expira_em,
    pix_copia_e_cola: pg.pix_copia_e_cola,
    pix_qr_data_uri: pg.pix_qr_data_uri,
    cliente_informou_em: pg.cliente_informou_em,
  });
}

async function informarPagamentoAssinatura(req, res) {
  const corpo = await lerCorpo(req);
  const token = corpo.token;
  const assinaturaId = Number(corpo.assinatura_id);
  if (!token || !assinaturaId) return erro(res, 400, 'Parâmetros inválidos.');
  const pg = consultarCheckoutAssinatura(token, assinaturaId);
  if (!pg) return erro(res, 404, 'Checkout não encontrado.');
  if (pg.status !== 'pendente') return erro(res, 409, 'Este checkout não está pendente.');
  db.prepare("UPDATE subscription_payments SET cliente_informou_em=datetime('now') WHERE id=?").run(pg.id);
  json(res, 200, { ok: true, mensagem: 'Aviso registrado. A clínica confirmará em breve.' });
}
async function excluirAssinatura(req, res, usuario, id) {
  const a = db.prepare('SELECT id, status, cliente_id, plano_id FROM subscriptions WHERE id = ?').get(id);
  if (!a) return erro(res, 404, 'Assinatura não encontrada');
  if (a.status === 'ativa') return erro(res, 409, 'Só é possível excluir assinaturas que não estejam ativas.');
  db.transaction(() => {
    db.prepare('DELETE FROM subscription_payments WHERE assinatura_id = ?').run(id);
    db.prepare('DELETE FROM subscription_cycles WHERE assinatura_id = ?').run(id);
    db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
  })();
  auditar('assinatura_excluida', { usuarioId: usuario.id, clienteId: a.cliente_id, entidade: 'subscription', entidadeId: id, detalhes: { status_anterior: a.status } });
  json(res, 200, { ok: true, mensagem: 'Assinatura excluída.' });
}
module.exports = {
  listarPlanos, salvarPlano, ativarPlano, excluirPlano,
  listarAssinaturas, obterAssinatura, contratar, alterarStatusAssinatura, excluirAssinatura,
  confirmarPagamento, confirmarPagamentoAssinatura, obterPixAssinatura, ajustarUsoRota, indicadores,
  clubeCliente, contratarCliente, consultarCheckout, informarPagamentoAssinatura, cancelarCliente, planosPublicos,
  elegibilidade, aoCriarAgendamento, aoFinalizarAgendamento, aoCancelarAgendamento,
  resumoPlano, criarCiclo, pagarCiclo, hojeISO,
};
