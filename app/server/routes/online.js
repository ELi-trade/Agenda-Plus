'use strict';
// Agendamento online público — sem autenticação, com validação integral no backend.

const { db, getConf } = require('../db/database');
const { json, erro, lerCorpo, exigirCampos, validarData, clienteDaRequisicao } = require('../core');
const { slotsDoProfissional, validarAgendamento } = require('../disponibilidade');
const pagamentosPix = require('../pagamentos');

// Configuração pública do estabelecimento (para o site de agendamento)
async function configPublica(req, res) {
  const est = getConf('estabelecimento', {});
  const funcionamento = db.prepare('SELECT dia_semana, aberto, hora_inicio, hora_fim FROM horario_funcionamento ORDER BY dia_semana').all();
  json(res, 200, {
    nome: est.nome || 'Estabelecimento',
    corPrimaria: est.corPrimaria || '#00B1C5',
    temaId: est.temaId || 'turquesa-rosa',
    modoAparencia: est.modoAparencia || 'claro',
    endereco: est.endereco || '',
    telefone: est.telefone || '',
    funcionamento,
  });
}

// Serviços ativos com profissionais habilitados
async function servicosPublicos(req, res) {
  const servicos = db.prepare('SELECT id, nome, descricao, categoria, preco_centavos, duracao_min FROM servicos WHERE ativo = 1 ORDER BY nome').all();
  const profs = db.prepare(`
    SELECT p.id, p.nome, p.especialidade FROM profissionais p
    JOIN servico_profissional sp ON sp.profissional_id = p.id
    WHERE sp.servico_id = ? AND p.ativo = 1 ORDER BY p.nome
  `);
  for (const s of servicos) s.profissionais = profs.all(s.id);
  json(res, 200, servicos.filter((s) => s.profissionais.length > 0));
}

// Slots disponíveis — só expõe horários realmente livres
async function slotsPublicos(req, res) {
  const url = new URL(req.url, 'http://x');
  const servicoId = Number(url.searchParams.get('servico_id'));
  const profissionalId = Number(url.searchParams.get('profissional_id') || 0);
  const data = url.searchParams.get('data');
  if (!servicoId || !validarData(data)) return erro(res, 400, 'Parâmetros inválidos');

  let profissionaisIds;
  if (profissionalId) {
    profissionaisIds = [profissionalId];
  } else {
    // todos os habilitados para o serviço
    profissionaisIds = db.prepare(
      'SELECT profissional_id FROM servico_profissional WHERE servico_id = ?'
    ).all(servicoId).map((r) => r.profissional_id);
  }

  const resultados = [];
  for (const pid of profissionaisIds) {
    const r = slotsDoProfissional(pid, servicoId, data);
    if (r.erro) continue;
    if (!r.slots.length) continue;
    const prof = db.prepare('SELECT id, nome, especialidade FROM profissionais WHERE id = ?').get(pid);
    resultados.push({ profissional: prof, slots: r.slots });
  }
  json(res, 200, { data, resultados });
}

// Cria o agendamento a partir do site público
async function agendarPublico(req, res) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['servico_id', 'profissional_id', 'data', 'hora_inicio']);
  if (!validarData(c.data)) return erro(res, 400, 'Data inválida.');

  const sessaoCliente = clienteDaRequisicao(req);
  const cli = c.cliente || {};
  if (!sessaoCliente) exigirCampos(cli, ['nome', 'telefone']);
  if (c.aceitou_regras !== true) return erro(res, 400, 'Leia e aceite a regra do sinal e do cancelamento para continuar.');
  if (!sessaoCliente && String(cli.telefone || '').replace(/\D/g, '').length < 10) return erro(res, 400, 'Informe um telefone válido.');

  const servico = db.prepare('SELECT * FROM servicos WHERE id = ? AND ativo = 1').get(c.servico_id);
  if (!servico) return erro(res, 400, 'Serviço indisponível.');

  let cliente = sessaoCliente
    ? db.prepare('SELECT id, nome, telefone, email FROM clientes WHERE id = ? AND ativo = 1').get(sessaoCliente.id)
    : db.prepare('SELECT id, nome, telefone, email FROM clientes WHERE telefone = ? AND ativo = 1').get(String(cli.telefone).trim());
  if (sessaoCliente && !cliente) return erro(res, 401, 'Acesso de cliente expirado.');
  if (!cliente) {
    const info = db.prepare('INSERT INTO clientes (nome, telefone, email) VALUES (?, ?, ?)')
      .run(String(cli.nome).trim(), String(cli.telefone).trim(), cli.email || null);
    cliente = { id: info.lastInsertRowid };
  }

  const val = validarAgendamento({
    profissionalId: c.profissional_id, servicoId: c.servico_id, salaId: null,
    data: c.data, horaInicio: c.hora_inicio,
  });
  if (!val.ok) return erro(res, 409, val.motivo || 'Horário indisponível');

  const dup = db.prepare("SELECT id FROM agendamentos WHERE profissional_id = ? AND data = ? AND hora_inicio = ? AND status IN ('pendente', 'confirmado', 'em_atendimento')")
    .get(c.profissional_id, c.data, c.hora_inicio);
  if (dup) return erro(res, 409, 'Este horário acabou de ser ocupado. Escolha outro, por favor.');

  // Desconto de 10% para agendamentos via app
  const descontoApp = 0.10;
  const valorFinalCentavos = Math.round(servico.preco_centavos * (1 - descontoApp));

  const info = db.prepare("INSERT INTO agendamentos (cliente_id, profissional_id, servico_id, data, hora_inicio, hora_fim, status, origem, pagamento_status, valor_final_centavos) VALUES (?, ?, ?, ?, ?, ?, 'pendente', 'online', 'aguardando', ?)")
    .run(cliente.id, c.profissional_id, c.servico_id, c.data, c.hora_inicio, val.horaFim, valorFinalCentavos);
  try {
    const checkout = await pagamentosPix.criarPagamento({
      agendamentoId: Number(info.lastInsertRowid),
      servico,
      cliente,
      valorFinalCentavos,
    });
    json(res, 201, {
      id: info.lastInsertRowid,
      pagamento: checkout.pagamento,
      token: checkout.checkoutToken,
    });
  } catch (e) {
    db.prepare("UPDATE agendamentos SET status='cancelado', pagamento_status='falha', atualizado_em=datetime('now') WHERE id=?")
      .run(info.lastInsertRowid);
    console.error('[pix] não foi possível iniciar o checkout:', e.message);
    json(res, 502, { erro: e.message || 'Não foi possível iniciar o pagamento Pix. Tente novamente.' });
  }
}
module.exports = { configPublica, servicosPublicos, slotsPublicos, agendarPublico };
