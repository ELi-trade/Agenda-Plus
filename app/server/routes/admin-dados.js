'use strict';

const { db, verificarSenha } = require('../db/database');
const { json, erro, lerCorpo, exigirCampos } = require('../core');
const TABELAS = ['usuarios', 'servicos', 'profissionais', 'salas', 'horarios_trabalho', 'pausas_trabalho', 'horario_funcionamento'];

function exigeAdmin(res, usuario) {
  if (!usuario) { erro(res, 401, 'Faça login como administrador.'); return false; }
  if (usuario.perfil !== 'admin') { erro(res, 403, 'Somente o administrador pode limpar dados iniciais.'); return false; }
  return true;
}

async function preview(req, res, usuario) {
  if (!exigeAdmin(res, usuario)) return;
  const contagens = {};
  for (const tabela of TABELAS) {
    contagens[tabela] = db.prepare('SELECT COUNT(*) AS total FROM marcadores_iniciais WHERE tabela = ?').get(tabela).total;
  }
  const inicial = db.prepare("SELECT COUNT(*) AS total FROM marcadores_iniciais m JOIN usuarios u ON u.id = m.registro_id WHERE m.tabela = 'usuarios' AND u.perfil = 'admin'").get().total;
  json(res, 200, {
    contagens, administradorPreservado: inicial > 0,
    observacao: 'A limpeza atua somente nos registros marcados como demonstração. Clientes, agendamentos, financeiro e configurações da clínica são preservados.',
  });
}

async function limpar(req, res, usuario) {
  if (!exigeAdmin(res, usuario)) return;
  const corpo = await lerCorpo(req);
  exigirCampos(corpo, ['senha', 'confirmacao']);
  if (corpo.confirmacao !== 'LIMPAR DADOS DE DEMONSTRACAO') return erro(res, 400, 'Digite exatamente LIMPAR DADOS DE DEMONSTRACAO.');
  const credencial = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ? AND ativo = 1').get(usuario.id);
  if (!credencial || !verificarSenha(corpo.senha, credencial.senha_hash)) return erro(res, 401, 'A senha do administrador está incorreta.');

  const apagados = { usuarios: 0, servicos: 0, profissionais: 0, salas: 0, horarios: 0 };
  const arquivados = { servicos: 0, profissionais: 0, salas: 0 };
  db.exec('BEGIN IMMEDIATE');
  try {
    const ids = (tabela) => db.prepare('SELECT registro_id FROM marcadores_iniciais WHERE tabela = ?').all(tabela).map((r) => Number(r.registro_id));
    for (const id of ids('usuarios')) {
      const conta = db.prepare('SELECT perfil FROM usuarios WHERE id = ?').get(id);
      if (conta && conta.perfil !== 'admin') {
        db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
        apagados.usuarios++;
      }
    }

    const regras = [
      { marcador: 'servicos', tabela: 'servicos', consulta: 'SELECT COUNT(*) AS n FROM agendamentos WHERE servico_id = ?', total: 'servicos' },
      { marcador: 'profissionais', tabela: 'profissionais', consulta: 'SELECT (SELECT COUNT(*) FROM agendamentos WHERE profissional_id = ?) + (SELECT COUNT(*) FROM usuarios WHERE profissional_id = ?) AS n', total: 'profissionais', conta: true },
      { marcador: 'salas', tabela: 'salas', consulta: 'SELECT COUNT(*) AS n FROM agendamentos WHERE sala_id = ?', total: 'salas' },
    ];
    for (const regra of regras) {
      for (const id of ids(regra.marcador)) {
        const q = db.prepare(regra.consulta);
        const referencias = regra.conta ? q.get(id, id).n : q.get(id).n;
        if (referencias > 0) {
          db.prepare('UPDATE ' + regra.tabela + ' SET ativo = 0 WHERE id = ?').run(id);
          arquivados[regra.total]++;
        } else {
          db.prepare('DELETE FROM ' + regra.tabela + ' WHERE id = ?').run(id);
          apagados[regra.total]++;
        }
      }
    }

    for (const tabela of ['horarios_trabalho', 'pausas_trabalho']) {
      for (const id of ids(tabela)) {
        const resultado = db.prepare('DELETE FROM ' + tabela + ' WHERE id = ?').run(id);
        apagados.horarios += Number(resultado.changes);
      }
    }
    // O funcionamento cadastrado pela clínica é configuração operacional; seus valores permanecem.
    db.prepare('DELETE FROM marcadores_iniciais').run();
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { }
    throw e;
  }
  json(res, 200, { ok: true, apagados, arquivados, administradorPreservado: true });
}

async function despachar(req, res, pathname, usuario) {
  if (req.method === 'GET' && pathname === '/api/admin/dados-iniciais') return preview(req, res, usuario);
  if (req.method === 'POST' && pathname === '/api/admin/dados-iniciais/limpar') return limpar(req, res, usuario);
  return erro(res, 404, 'Rota administrativa não encontrada.');
}
module.exports = { despachar };