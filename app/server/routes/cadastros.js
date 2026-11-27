'use strict';
// Rotas de cadastros: clientes, profissionais, serviços, salas, bloqueios, horários

const { db } = require('../db/database');
const { json, erro, lerCorpo, exigirCampos, validarEmail, ValidationError } = require('../core');

// ---------- Clientes ----------
async function listarClientes(req, res) {
  const url = new URL(req.url, 'http://x');
  const busca = (url.searchParams.get('busca') || '').trim().toLowerCase();
  let rows;
  if (busca) {
    rows = db.prepare(`
      SELECT id, nome, telefone, email, data_nascimento, observacoes, ativo, criado_em, atualizado_em FROM clientes
      WHERE (LOWER(nome) LIKE ? OR telefone LIKE ? OR LOWER(IFNULL(email,'')) LIKE ?) AND ativo = 1
      ORDER BY nome LIMIT 100
    `).all(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  } else {
    rows = db.prepare('SELECT id, nome, telefone, email, data_nascimento, observacoes, ativo, criado_em, atualizado_em FROM clientes WHERE ativo = 1 ORDER BY nome LIMIT 200').all();
  }
  // contador de agendamentos (recorrência)
  const cont = db.prepare('SELECT COUNT(*) AS n FROM agendamentos WHERE cliente_id = ? AND status IN (\'finalizado\',\'confirmado\',\'em_atendimento\',\'pendente\')');
  for (const r of rows) r.total_agendamentos = cont.get(r.id).n;
  json(res, 200, rows);
}

async function obterCliente(req, res, _u, id) {
  const cliente = db.prepare('SELECT id, nome, telefone, email, data_nascimento, observacoes, ativo, criado_em, atualizado_em FROM clientes WHERE id = ?').get(id);
  if (!cliente) return erro(res, 404, 'Cliente não encontrado');
  cliente.agendamentos = db.prepare(`
    SELECT a.*, s.nome AS servico, p.nome AS profissional
    FROM agendamentos a JOIN servicos s ON s.id = a.servico_id JOIN profissionais p ON p.id = a.profissional_id
    WHERE a.cliente_id = ? ORDER BY a.data DESC, a.hora_inicio DESC LIMIT 100
  `).all(id);
  json(res, 200, cliente);
}

async function salvarCliente(req, res, _u, id) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['nome']);
  if (c.email && !validarEmail(c.email)) return erro(res, 400, 'E-mail inválido');
  if (id) {
    db.prepare(`UPDATE clientes SET nome=?, telefone=?, email=?, data_nascimento=?, observacoes=?,
                atualizado_em=datetime('now') WHERE id=?`)
      .run(c.nome.trim(), c.telefone || null, c.email || null, c.data_nascimento || null, c.observacoes || null, id);
    return json(res, 200, { id: Number(id) });
  }
  const info = db.prepare(`INSERT INTO clientes (nome, telefone, email, data_nascimento, observacoes) VALUES (?, ?, ?, ?, ?)`)
    .run(c.nome.trim(), c.telefone || null, c.email || null, c.data_nascimento || null, c.observacoes || null);
  json(res, 201, { id: info.lastInsertRowid });
}

async function excluirCliente(req, res, _u, id) {
  // exclusão lógica — mantém histórico de agendamentos
  db.prepare('UPDATE clientes SET ativo = 0, atualizado_em = datetime(\'now\') WHERE id = ?').run(id);
  json(res, 200, { ok: true });
}

// ---------- Profissionais ----------
async function listarProfissionais(req, res) {
  const rows = db.prepare('SELECT * FROM profissionais ORDER BY nome').all();
  const srv = db.prepare(`
    SELECT s.* FROM servicos s JOIN servico_profissional sp ON sp.servico_id = s.id
    WHERE sp.profissional_id = ? AND s.ativo = 1
  `);
  const ht = db.prepare('SELECT dia_semana, hora_inicio, hora_fim FROM horarios_trabalho WHERE profissional_id = ? ORDER BY dia_semana, hora_inicio');
  const pz = db.prepare('SELECT dia_semana, hora_inicio, hora_fim FROM pausas_trabalho WHERE profissional_id = ? ORDER BY dia_semana');
  for (const r of rows) {
    r.servicos = srv.all(r.id);
    r.horarios = ht.all(r.id);
    r.pausas = pz.all(r.id);
  }
  json(res, 200, rows);
}

async function salvarProfissional(req, res, _u, id) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['nome']);
  if (id) {
    const atual = db.prepare('SELECT * FROM profissionais WHERE id = ?').get(id);
    if (!atual) return erro(res, 404, 'Profissional não encontrado');
    db.prepare('UPDATE profissionais SET nome=?, especialidade=?, telefone=?, email=?, ativo=? WHERE id=?')
      .run(c.nome.trim(), c.especialidade ?? atual.especialidade, c.telefone ?? atual.telefone, c.email ?? atual.email,
           c.ativo === undefined ? atual.ativo : (c.ativo ? 1 : 0), id);
    if (Array.isArray(c.servicoIds)) {
      db.prepare('DELETE FROM servico_profissional WHERE profissional_id = ?').run(id);
      const ins = db.prepare('INSERT INTO servico_profissional (servico_id, profissional_id) VALUES (?, ?)');
      for (const s of c.servicoIds) ins.run(s, id);
    }
    if (Array.isArray(c.horarios)) {
      db.prepare('DELETE FROM horarios_trabalho WHERE profissional_id = ?').run(id);
      const ins = db.prepare('INSERT INTO horarios_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)');
      for (const h of c.horarios) ins.run(id, h.dia_semana, h.hora_inicio, h.hora_fim);
    }
    if (Array.isArray(c.pausas)) {
      db.prepare('DELETE FROM pausas_trabalho WHERE profissional_id = ?').run(id);
      const ins = db.prepare('INSERT INTO pausas_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)');
      for (const p of c.pausas) ins.run(id, p.dia_semana, p.hora_inicio, p.hora_fim);
    }
    return json(res, 200, { id: Number(id) });
  }
  const info = db.prepare('INSERT INTO profissionais (nome, especialidade, telefone, email) VALUES (?, ?, ?, ?)')
    .run(c.nome.trim(), c.especialidade || null, c.telefone || null, c.email || null);
  const pid = info.lastInsertRowid;
  if (Array.isArray(c.servicoIds)) {
    const ins = db.prepare('INSERT INTO servico_profissional (servico_id, profissional_id) VALUES (?, ?)');
    for (const s of c.servicoIds) ins.run(s, pid);
  }
  if (Array.isArray(c.horarios)) {
    const ins = db.prepare('INSERT INTO horarios_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)');
    for (const h of c.horarios) ins.run(pid, h.dia_semana, h.hora_inicio, h.hora_fim);
  }
  json(res, 201, { id: pid });
}

async function excluirProfissional(req, res, _u, id) {
  db.prepare('UPDATE profissionais SET ativo = 0 WHERE id = ?').run(id);
  json(res, 200, { ok: true });
}

// ---------- Serviços ----------
async function listarServicos(req, res) {
  const url = new URL(req.url, 'http://x');
  const apenasAtivos = url.searchParams.get('ativos') === '1';
  const rows = db.prepare(`SELECT * FROM servicos ${apenasAtivos ? 'WHERE ativo = 1' : ''} ORDER BY nome`).all();
  const profs = db.prepare(`
    SELECT p.id, p.nome FROM profissionais p JOIN servico_profissional sp ON sp.profissional_id = p.id
    WHERE sp.servico_id = ? AND p.ativo = 1
  `);
  for (const r of rows) r.profissionais = profs.all(r.id);
  json(res, 200, rows);
}

async function salvarServico(req, res, _u, id) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['nome']);
  const preco = Math.round(Number(c.preco || 0) * 100);
  if (!Number.isFinite(preco) || preco < 0) return erro(res, 400, 'Preço inválido');
  const dur = Number(c.duracao_min || 30), inter = Number(c.intervalo_min || 0);
  if (!(dur > 0) || inter < 0) return erro(res, 400, 'Duração/intervalo inválidos');

  if (id) {
    const atual = db.prepare('SELECT * FROM servicos WHERE id = ?').get(id);
    if (!atual) return erro(res, 404, 'Serviço não encontrado');
    db.prepare('UPDATE servicos SET nome=?, descricao=?, categoria=?, preco_centavos=?, duracao_min=?, intervalo_min=?, ativo=? WHERE id=?')
      .run(c.nome.trim(), c.descricao ?? atual.descricao, c.categoria ?? atual.categoria, preco, dur, inter,
           c.ativo === undefined ? atual.ativo : (c.ativo ? 1 : 0), id);
    if (Array.isArray(c.profissionalIds)) {
      db.prepare('DELETE FROM servico_profissional WHERE servico_id = ?').run(id);
      const ins = db.prepare('INSERT INTO servico_profissional (servico_id, profissional_id) VALUES (?, ?)');
      for (const p of c.profissionalIds) ins.run(id, p);
    }
    return json(res, 200, { id: Number(id) });
  }
  const info = db.prepare('INSERT INTO servicos (nome, descricao, categoria, preco_centavos, duracao_min, intervalo_min) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.nome.trim(), c.descricao || null, c.categoria || null, preco, dur, inter);
  const sid = info.lastInsertRowid;
  if (Array.isArray(c.profissionalIds)) {
    const ins = db.prepare('INSERT INTO servico_profissional (servico_id, profissional_id) VALUES (?, ?)');
    for (const p of c.profissionalIds) ins.run(sid, p);
  }
  json(res, 201, { id: sid });
}

async function excluirServico(req, res, _u, id) {
  db.prepare('UPDATE servicos SET ativo = 0 WHERE id = ?').run(id);
  json(res, 200, { ok: true });
}

// ---------- Salas ----------
async function listarSalas(req, res) {
  json(res, 200, db.prepare('SELECT * FROM salas ORDER BY nome').all());
}

async function salvarSala(req, res, _u, id) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['nome']);
  if (id) {
    db.prepare('UPDATE salas SET nome=?, ativa=? WHERE id=?').run(c.nome.trim(), c.ativa ? 1 : 0, id);
    return json(res, 200, { id: Number(id) });
  }
  const info = db.prepare('INSERT INTO salas (nome) VALUES (?)').run(c.nome.trim());
  json(res, 201, { id: info.lastInsertRowid });
}

async function excluirSala(req, res, _u, id) {
  db.prepare('UPDATE salas SET ativa = 0 WHERE id = ?').run(id);
  json(res, 200, { ok: true });
}

// ---------- Bloqueios ----------
async function listarBloqueios(req, res) {
  const rows = db.prepare(`
    SELECT b.*, p.nome AS profissional FROM bloqueios b
    LEFT JOIN profissionais p ON p.id = b.profissional_id
    ORDER BY b.data_inicio DESC LIMIT 200
  `).all();
  json(res, 200, rows);
}

async function salvarBloqueio(req, res) {
  const c = await lerCorpo(req);
  exigirCampos(c, ['data_inicio', 'data_fim']);
  if (c.data_fim < c.data_inicio) return erro(res, 400, 'Data final anterior à inicial');
  if (c.hora_inicio && c.hora_fim && c.hora_fim <= c.hora_inicio) return erro(res, 400, 'Hora final deve ser maior que a inicial');
  const info = db.prepare(`
    INSERT INTO bloqueios (profissional_id, data_inicio, data_fim, hora_inicio, hora_fim, motivo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(c.profissional_id || null, c.data_inicio, c.data_fim, c.hora_inicio || null, c.hora_fim || null, c.motivo || null);
  json(res, 201, { id: info.lastInsertRowid });
}

async function excluirBloqueio(req, res, _u, id) {
  db.prepare('DELETE FROM bloqueios WHERE id = ?').run(id);
  json(res, 200, { ok: true });
}

// ---------- Horário de funcionamento ----------
async function obterFuncionamento(req, res) {
  json(res, 200, db.prepare('SELECT * FROM horario_funcionamento ORDER BY dia_semana').all());
}

async function salvarFuncionamento(req, res) {
  const lista = await lerCorpo(req);
  if (!Array.isArray(lista)) return erro(res, 400, 'Formato inválido');
  const upd = db.prepare('UPDATE horario_funcionamento SET aberto=?, hora_inicio=?, hora_fim=? WHERE dia_semana=?');
  for (const d of lista) {
    if (d.aberto && (!d.hora_inicio || !d.hora_fim || d.hora_fim <= d.hora_inicio)) {
      return erro(res, 400, `Horário inválido no dia ${d.dia_semana}`);
    }
    upd.run(d.aberto ? 1 : 0, d.aberto ? d.hora_inicio : null, d.aberto ? d.hora_fim : null, d.dia_semana);
  }
  json(res, 200, { ok: true });
}

module.exports = {
  listarClientes, obterCliente, salvarCliente, excluirCliente, inativarCliente,
  listarProfissionais, salvarProfissional, excluirProfissional,
  listarServicos, salvarServico, excluirServico,
  listarSalas, salvarSala, excluirSala,
  listarBloqueios, salvarBloqueio, excluirBloqueio,
  obterFuncionamento, salvarFuncionamento,
};
