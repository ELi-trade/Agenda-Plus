'use strict';
// Motor de disponibilidade — TODAS as regras validadas aqui (fonte única de verdade).
// O frontend apenas exibe o que este módulo autoriza.

const { db } = require('./db/database');

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function paraMinutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function paraHHMM(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** Retorna a lista de slots livres para um profissional+serviço em uma data. */
function slotsDoProfissional(profissionalId, servicoId, data) {
  const dt = new Date(`${data}T12:00:00`);
  if (isNaN(dt)) return { erro: 'Data inválida' };
  const diaSemana = dt.getDay();

  // 1. Serviço: duração + intervalo adicional
  const servico = db.prepare('SELECT * FROM servicos WHERE id = ? AND ativo = 1').get(servicoId);
  if (!servico) return { erro: 'Serviço inválido ou inativo' };
  const duracaoTotal = servico.duracao_min + servico.intervalo_min;

  // 2. Profissional habilitado para o serviço?
  const habilitado = db.prepare(
    'SELECT 1 FROM servico_profissional WHERE servico_id = ? AND profissional_id = ?'
  ).get(servicoId, profissionalId);
  if (!habilitado) return { erro: 'Profissional não habilitado para este serviço' };

  // 3. Profissional ativo?
  const prof = db.prepare('SELECT * FROM profissionais WHERE id = ? AND ativo = 1').get(profissionalId);
  if (!prof) return { erro: 'Profissional inativo' };

  // 4. Horário de funcionamento do estabelecimento
  const funcionamento = db.prepare('SELECT * FROM horario_funcionamento WHERE dia_semana = ?').get(diaSemana);
  if (!funcionamento || !funcionamento.aberto) return { slots: [], motivo: 'Estabelecimento fechado neste dia' };

  // 5. Horários de trabalho do profissional no dia
  const turnos = db.prepare(
    'SELECT * FROM horarios_trabalho WHERE profissional_id = ? AND dia_semana = ? ORDER BY hora_inicio'
  ).all(profissionalId, diaSemana);
  if (!turnos.length) return { slots: [], motivo: 'Profissional não atende neste dia' };

  // 6. Pausas (ex.: almoço)
  const pausas = db.prepare(
    'SELECT * FROM pausas_trabalho WHERE profissional_id = ? AND dia_semana = ?'
  ).all(profissionalId, diaSemana);

  // 7. Bloqueios (férias/folga/compromissos) — do profissional ou gerais
  const bloqueios = db.prepare(`
    SELECT * FROM bloqueios
    WHERE (profissional_id IS NULL OR profissional_id = ?)
      AND data_inicio <= ? AND data_fim >= ?
  `).all(profissionalId, data, data);

  // 8. Agendamentos existentes que conflitam (status ativos)
  const ocupados = db.prepare(`
    SELECT hora_inicio, hora_fim FROM agendamentos
    WHERE profissional_id = ? AND data = ?
      AND status IN ('pendente','confirmado','em_atendimento')
      AND (pagamento_status <> 'aguardando' OR pagamento_expira_em IS NULL OR julianday(pagamento_expira_em) > julianday('now'))
  `).all(profissionalId, data).map((a) => [paraMinutos(a.hora_inicio), paraMinutos(a.hora_fim)]);

  // 9. Gera slots a partir do espacamento do serviço (usa intervalo do serviço como passo mínimo 5)
  const passo = Math.max(5, Math.min(60, servico.intervalo_min || 10));
  const livres = new Set();

  const dentroDeBloqueio = (min, minFim) =>
    bloqueios.some((b) => {
      const ini = b.hora_inicio ? paraMinutos(b.hora_inicio) : 0;
      const fim = b.hora_fim ? paraMinutos(b.hora_fim) : 24 * 60;
      return min < fim && minFim > ini;
    });

  const conflita = (min, minFim, lista) => lista.some(([i, f]) => min < f && minFim > i);

  for (const turno of turnos) {
    const tIni = Math.max(paraMinutos(turno.hora_inicio), paraMinutos(funcionamento.hora_inicio || '00:00'));
    const tFim = Math.min(paraMinutos(turno.hora_fim), paraMinutos(funcionamento.hora_fim || '23:59'));
    for (let min = tIni; min + duracaoTotal <= tFim; min += passo) {
      const minFim = min + duracaoTotal;
      if (conflita(min, minFim, pausas.map((p) => [paraMinutos(p.hora_inicio), paraMinutos(p.hora_fim)]))) continue;
      if (dentroDeBloqueio(min, minFim)) continue;
      if (conflita(min, minFim, ocupados)) continue;
      livres.add(paraHHMM(min));
    }
  }

  return { slots: [...livres].sort(), servico: { nome: servico.nome, duracao: servico.duracao_min } };
}

/**
 * Valida se um agendamento pode ser criado/editado.
 * Retorna { ok: true } ou { ok: false, motivo }.
 */
function validarAgendamento({ agendamentoId = null, profissionalId, servicoId, salaId, data, horaInicio, ignorarStatus = [] }) {
  const dt = new Date(`${data}T12:00:00`);
  if (isNaN(dt)) return { ok: false, motivo: 'Data inválida' };
  if (!/^\d{2}:\d{2}$/.test(horaInicio || '')) return { ok: false, motivo: 'Hora inválida' };
  const diaSemana = dt.getDay();

  const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(servicoId);
  if (!servico) return { ok: false, motivo: 'Serviço não encontrado' };
  const duracaoTotal = servico.duracao_min + servico.intervalo_min;
  const minInicio = paraMinutos(horaInicio);
  const minFim = minInicio + duracaoTotal;

  // Profissional habilitado e ativo
  const habilitado = db.prepare(
    'SELECT 1 FROM servico_profissional WHERE servico_id = ? AND profissional_id = ?'
  ).get(servicoId, profissionalId);
  if (!habilitado) return { ok: false, motivo: 'Profissional não habilitado para este serviço' };

  const prof = db.prepare('SELECT * FROM profissionais WHERE id = ?').get(profissionalId);
  if (!prof || !prof.ativo) return { ok: false, motivo: 'Profissional inativo' };

  // Horário de funcionamento
  const funcionamento = db.prepare('SELECT * FROM horario_funcionamento WHERE dia_semana = ?').get(diaSemana);
  if (!funcionamento || !funcionamento.aberto) return { ok: false, motivo: 'Estabelecimento fechado neste dia' };
  if (minInicio < paraMinutos(funcionamento.hora_inicio) || minFim > paraMinutos(funcionamento.hora_fim)) {
    return { ok: false, motivo: `Fora do horário de funcionamento (${funcionamento.hora_inicio}–${funcionamento.hora_fim})` };
  }

  // Turnos de trabalho do profissional
  const turnos = db.prepare(
    'SELECT * FROM horarios_trabalho WHERE profissional_id = ? AND dia_semana = ?'
  ).all(profissionalId, diaSemana);
  const dentroDeTurno = turnos.some((t) =>
    minInicio >= paraMinutos(t.hora_inicio) && minFim <= paraMinutos(t.hora_fim)
  );
  if (!dentroDeTurno) return { ok: false, motivo: 'Fora do horário de trabalho do profissional' };

  // Pausas
  const pausas = db.prepare(
    'SELECT * FROM pausas_trabalho WHERE profissional_id = ? AND dia_semana = ?'
  ).all(profissionalId, diaSemana);
  for (const p of pausas) {
    if (minInicio < paraMinutos(p.hora_fim) && minFim > paraMinutos(p.hora_inicio)) {
      return { ok: false, motivo: `Conflita com a pausa ${p.hora_inicio}–${p.hora_fim}` };
    }
  }

  // Bloqueios (profissional específico ou gerais)
  const bloqueios = db.prepare(`
    SELECT * FROM bloqueios
    WHERE (profissional_id IS NULL OR profissional_id = ?)
      AND data_inicio <= ? AND data_fim >= ?
  `).all(profissionalId, data, data);
  for (const b of bloqueios) {
    const bIni = b.hora_inicio ? paraMinutos(b.hora_inicio) : 0;
    const bFim = b.hora_fim ? paraMinutos(b.hora_fim) : 24 * 60;
    if (minInicio < bFim && minFim > bIni) {
      return { ok: false, motivo: `Agenda bloqueada${b.motivo ? `: ${b.motivo}` : ' neste período'}` };
    }
  }

  // Sala: ocupada? (se informada)
  if (salaId) {
    const sala = db.prepare('SELECT * FROM salas WHERE id = ?').get(salaId);
    if (!sala || !sala.ativa) return { ok: false, motivo: 'Sala inválida ou inativa' };
    const conflitoSala = db.prepare(`
      SELECT COUNT(*) AS n FROM agendamentos
      WHERE sala_id = ? AND data = ? AND status IN ('pendente','confirmado','em_atendimento')
        AND hora_inicio < ? AND hora_fim > ? AND id != COALESCE(?, -1)
    `).get(salaId, data, paraHHMM(minFim), horaInicio, agendamentoId).n;
    if (conflitoSala > 0) return { ok: false, motivo: 'Sala já ocupada neste horário' };
  }

  // Conflito do profissional (agendamento ativo sobreposto)
  const conflito = db.prepare(`
    SELECT id FROM agendamentos
    WHERE profissional_id = ? AND data = ? AND status IN ('pendente','confirmado','em_atendimento')
      AND hora_inicio < ? AND hora_fim > ? AND id != COALESCE(?, -1)
    LIMIT 1
  `).get(profissionalId, data, paraHHMM(minFim), horaInicio, agendamentoId);
  if (conflito) return { ok: false, motivo: 'Profissional já possui agendamento neste horário' };

  // Duplicidade exata (mesmo cliente, prof, serviço, data, hora, ativo)
  // — validado na rota de criação usando o cliente, que não está disponível aqui.

  return { ok: true, horaFim: paraHHMM(minFim), duracaoTotal };
}

module.exports = { slotsDoProfissional, validarAgendamento, paraMinutos, paraHHMM, DIAS };
