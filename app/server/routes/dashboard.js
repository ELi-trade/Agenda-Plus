'use strict';
// Dashboard, agenda mensal e indicadores financeiros.

const { db } = require('../db/database');
const { json, temPermissao } = require('../core');
const { resumoFinanceiro } = require('./financeiro');

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function aniversariantesProximos(hoje) {
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const hojeUTC = Date.UTC(ano, mes - 1, dia);
  return db.prepare('SELECT id, nome, data_nascimento FROM clientes WHERE ativo = 1 AND data_nascimento IS NOT NULL ORDER BY nome')
    .all()
    .map((cliente) => {
      const partes = String(cliente.data_nascimento).split('-').map(Number);
      if (partes.length !== 3 || !partes[1] || !partes[2]) return null;
      let aniversario = Date.UTC(ano, partes[1] - 1, partes[2]);
      if (aniversario < hojeUTC) aniversario = Date.UTC(ano + 1, partes[1] - 1, partes[2]);
      const dias = Math.round((aniversario - hojeUTC) / 86400000);
      return dias <= 7 ? { id: cliente.id, nome: cliente.nome, data_nascimento: cliente.data_nascimento, dias } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function dashboard(req, res, usuario) {
  const hoje = hojeISO();
  const url = new URL(req.url, 'http://x');
  const solicitado = url.searchParams.get('mes');
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(solicitado || '') ? solicitado : hoje.slice(0, 7);
  const [ano, numeroMes] = mes.split('-').map(Number);
  const inicioMes = mes + '-01';
  const fimMes = new Date(Date.UTC(ano, numeroMes, 0)).toISOString().slice(0, 10);
  const filtroProf = usuario.perfil === 'profissional' && usuario.profissional_id
    ? `AND a.profissional_id = ${Number(usuario.profissional_id)}` : '';

  const deHoje = db.prepare(`
    SELECT a.*, c.nome AS cliente, c.telefone AS cliente_telefone, p.nome AS profissional,
           s.nome AS servico, sa.nome AS sala
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN profissionais p ON p.id = a.profissional_id
    JOIN servicos s ON s.id = a.servico_id
    LEFT JOIN salas sa ON sa.id = a.sala_id
    WHERE a.data = ? ${filtroProf} AND (a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))
    ORDER BY a.hora_inicio
  `).all(hoje);

  const proximos = db.prepare(`
    SELECT a.*, c.nome AS cliente, p.nome AS profissional, s.nome AS servico
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN profissionais p ON p.id = a.profissional_id
    JOIN servicos s ON s.id = a.servico_id
    WHERE a.data > ? AND a.status IN ('pendente','confirmado') ${filtroProf} AND (a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))
    ORDER BY a.data, a.hora_inicio LIMIT 10
  `).all(hoje);

  const agendamentosMes = db.prepare(`
    SELECT a.id, a.data, a.hora_inicio, a.status, c.nome AS cliente
    FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id
    WHERE a.data BETWEEN ? AND ? ${filtroProf} AND (a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))
    ORDER BY a.data, a.hora_inicio
  `).all(inicioMes, fimMes);

  const um = (sql) => db.prepare(sql).get().n;
  const resumo = {
    hoje_total: deHoje.length,
    hoje_pendentes: deHoje.filter((a) => a.status === 'pendente').length,
    hoje_confirmados: deHoje.filter((a) => a.status === 'confirmado').length,
    hoje_finalizados: deHoje.filter((a) => a.status === 'finalizado').length,
    hoje_faltas: deHoje.filter((a) => a.status === 'falta').length,
    hoje_cancelados: deHoje.filter((a) => a.status === 'cancelado').length,
    hoje_clientes: new Set(deHoje.filter((a) => a.status === 'finalizado').map((a) => a.cliente_id)).size,
    mes_total: um(`SELECT COUNT(*) AS n FROM agendamentos a WHERE a.data >= '${inicioMes}' AND a.status != 'cancelado' ${filtroProf} AND (a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))`),
    mes_cancelados: um(`SELECT COUNT(*) AS n FROM agendamentos a WHERE a.data >= '${inicioMes}' AND a.status = 'cancelado' ${filtroProf} AND (a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))`),
    mes_faltas: um(`SELECT COUNT(*) AS n FROM agendamentos a WHERE a.data >= '${inicioMes}' AND a.status = 'falta' ${filtroProf} AND (a.origem <> 'online' OR a.pagamento_status IN ('dispensado','pago','reembolso_pendente','reembolsado','reembolso_parcial','retido'))`),
    clientes_ativos: um('SELECT COUNT(*) AS n FROM clientes WHERE ativo = 1'),
    profissionais_ativos: um('SELECT COUNT(*) AS n FROM profissionais WHERE ativo = 1'),
  };
  const financeiro = temPermissao(usuario, 'financeiro') ? resumoFinanceiro(inicioMes, fimMes, hoje) : null;
  json(res, 200, {
    hoje, mes, resumo, financeiro, agendamentos_hoje: deHoje, proximos,
    agendamentos_mes: agendamentosMes, aniversariantes: aniversariantesProximos(hoje),
  });
}

module.exports = { dashboard };