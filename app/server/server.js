'use strict';
// Servidor HTTP principal — API + frontend estático

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
try { require('node:process').loadEnvFile(path.join(__dirname, '..', '..', '.env')); }
catch (e) { if (e.code !== 'ENOENT') throw e; }

const { db, getConf, setConf, DB_PATH } = require('./db/database');
const {
  json, erro, lerCorpo, usuarioDaRequisicao, temPermissao, ValidationError,
} = require('./core');

const auth = require('./routes/auth');
const cad = require('./routes/cadastros');
const agd = require('./routes/agendamentos');
const onl = require('./routes/online');
const dash = require('./routes/dashboard');
const notif = require('./routes/notificacoes');
const fin = require('./routes/financeiro');
const clientesAuth = require('./routes/clientes-auth');
const adminDados = require('./routes/admin-dados');
const pagamentosPix = require('./pagamentos');
const club = require('./routes/assinaturas');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function servirEstatico(req, res, pathname) {
  let arq = pathname === '/' ? '/index.html' : pathname;
  // rotas de SPA
  if (!path.extname(arq)) arq = '/index.html';
  const caminho = path.join(PUBLIC_DIR, path.normalize(arq).replace(/^(\.\.[\/\\])+/, ''));
  if (!caminho.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(caminho, (e, dados) => {
    if (e) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('Não encontrado'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(idx);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(caminho)] || 'application/octet-stream' });
    res.end(dados);
  });
}

async function tratarAPI(req, res, pathname, usuario) {
  const metodo = req.method;
  const partes = pathname.split('/').filter(Boolean); // ex: ['api','clientes','3']
  const [_, recurso, id, sub] = partes;

  // ----- público -----
  if (pathname.startsWith('/api/cliente/')) return clientesAuth.despachar(req, res, pathname);
  if (pathname.startsWith('/api/publico/')) {
    const rotaPagamento = pathname.match(/^\/api\/publico\/agendamentos\/(\d+)\/pagamento(?:\/informar)?$/);
    if (rotaPagamento) return pagamentosPix.despachar(req, res, pathname);
    const p = pathname.replace('/api/publico/', '');
    if (metodo === 'GET' && p === 'config') return onl.configPublica(req, res);
    if (metodo === 'GET' && p === 'planos-clube') return club.planosPublicos(req, res);
    if (metodo === 'GET' && p === 'servicos') return onl.servicosPublicos(req, res);
    if (metodo === 'GET' && p === 'slots') return onl.slotsPublicos(req, res);
    if (metodo === 'POST' && p === 'agendar') return onl.agendarPublico(req, res);
    return erro(res, 404, 'Rota não encontrada');
  }

  // ----- auth -----
  if (metodo === 'POST' && pathname === '/api/login') return auth.login(req, res);
  if (metodo === 'POST' && pathname === '/api/logout') return auth.logout(req, res);
  if (metodo === 'POST' && pathname === '/api/registrar') return erro(res, 403, 'Criação de contas da equipe somente pelo painel do administrador.');
  if (metodo === 'POST' && pathname === '/api/recuperar') return auth.recuperarSolicitacao(req, res);
  if (metodo === 'POST' && pathname === '/api/recuperar/confirmar') return auth.recuperarConfirmar(req, res);
  if (metodo === 'GET' && pathname === '/api/usuario-atual') {
    if (!usuario) return erro(res, 401, 'Não autenticado');
    return json(res, 200, { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, profissionalId: usuario.profissional_id });
  }

  // ----- a partir daqui exige sessão -----
  if (!usuario) return erro(res, 401, 'Não autenticado');

  if (pathname.startsWith('/api/admin/')) return adminDados.despachar(req, res, pathname, usuario);

  if (metodo === 'GET' && pathname === '/api/dashboard') return dash.dashboard(req, res, usuario);
  if (metodo === 'GET' && pathname === '/api/pagamentos/devolucoes-manuais') {
    if (usuario.perfil !== 'admin') return erro(res, 403, 'Somente o administrador pode consultar devoluções Pix.');
    return json(res, 200, pagamentosPix.listarDevolucoesManuais());
  }
  if (/^\/api\/pagamentos\/devolucoes\/\d+\/confirmar$/.test(pathname)) {
    if (metodo !== 'POST' || usuario.perfil !== 'admin') return erro(res, 403, 'Somente o administrador pode registrar uma devolução manual.');
    return pagamentosPix.despachar(req, res, pathname);
  }

  if (recurso === 'usuarios') {
    if (metodo === 'GET' && !id) return auth.listarUsuarios(req, res, usuario);
    if ((metodo === 'POST' || metodo === 'PUT') && !id) return auth.salvarUsuario(req, res, usuario);
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'clientes') {
    if (metodo === 'GET' && !id) { if (!temPermissao(usuario, 'cadastros:ler')) return erro(res, 403, 'Sem permissão'); return cad.listarClientes(req, res); }
    if (metodo === 'GET' && id) { if (!temPermissao(usuario, 'cadastros:ler')) return erro(res, 403, 'Sem permissão'); return cad.obterCliente(req, res, usuario, id); }
    if (metodo === 'POST' && !id) { if (!temPermissao(usuario, 'cadastros:escrever')) return erro(res, 403, 'Sem permissão'); return cad.salvarCliente(req, res, usuario, null); }
    if ((metodo === 'PUT' || metodo === 'POST') && id) { if (!temPermissao(usuario, 'cadastros:escrever')) return erro(res, 403, 'Sem permissão'); return cad.salvarCliente(req, res, usuario, id); }
    if (metodo === 'DELETE' && id) { if (!temPermissao(usuario, 'cadastros:escrever')) return erro(res, 403, 'Sem permissão'); return cad.excluirCliente(req, res, usuario, id); }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'profissionais') {
    const esc = temPermissao(usuario, 'cadastros:escrever');
    if (metodo === 'GET' && !id) { if (!temPermissao(usuario, 'cadastros:ler')) return erro(res, 403, 'Sem permissão'); return cad.listarProfissionais(req, res); }
    if ((metodo === 'POST' || metodo === 'PUT') && !id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.salvarProfissional(req, res, usuario, null); }
    if ((metodo === 'PUT' || metodo === 'POST') && id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.salvarProfissional(req, res, usuario, id); }
    if (metodo === 'DELETE' && id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.excluirProfissional(req, res, usuario, id); }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'servicos') {
    const esc = temPermissao(usuario, 'cadastros:escrever');
    if (metodo === 'GET' && !id) { if (!temPermissao(usuario, 'cadastros:ler')) return erro(res, 403, 'Sem permissão'); return cad.listarServicos(req, res); }
    if ((metodo === 'POST' || metodo === 'PUT') && !id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.salvarServico(req, res, usuario, null); }
    if ((metodo === 'PUT' || metodo === 'POST') && id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.salvarServico(req, res, usuario, id); }
    if (metodo === 'DELETE' && id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.excluirServico(req, res, usuario, id); }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'salas') {
    const esc = temPermissao(usuario, 'cadastros:escrever');
    if (metodo === 'GET' && !id) { if (!temPermissao(usuario, 'cadastros:ler')) return erro(res, 403, 'Sem permissão'); return cad.listarSalas(req, res); }
    if ((metodo === 'POST' || metodo === 'PUT') && !id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.salvarSala(req, res, usuario, null); }
    if ((metodo === 'PUT' || metodo === 'POST') && id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.salvarSala(req, res, usuario, id); }
    if (metodo === 'DELETE' && id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.excluirSala(req, res, usuario, id); }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'bloqueios') {
    const esc = temPermissao(usuario, 'cadastros:escrever');
    if (metodo === 'GET' && !id) { if (!temPermissao(usuario, 'agenda')) return erro(res, 403, 'Sem permissão'); return cad.listarBloqueios(req, res); }
    if ((metodo === 'POST' || metodo === 'PUT') && !id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.salvarBloqueio(req, res); }
    if (metodo === 'DELETE' && id) { if (!esc) return erro(res, 403, 'Sem permissão'); return cad.excluirBloqueio(req, res, usuario, id); }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'funcionamento') {
    if (metodo === 'GET' && !id) { if (!temPermissao(usuario, 'agenda')) return erro(res, 403, 'Sem permissão'); return cad.obterFuncionamento(req, res); }
    if ((metodo === 'POST' || metodo === 'PUT') && !id) {
      if (!temPermissao(usuario, 'configuracoes')) return erro(res, 403, 'Sem permissão');
      return cad.salvarFuncionamento(req, res);
    }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'disponibilidade') {
    if (metodo === 'GET') { if (!temPermissao(usuario, 'agenda')) return erro(res, 403, 'Sem permissão'); return agd.consultarSlots(req, res); }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'agendamentos') {
    if (!temPermissao(usuario, 'agenda')) return erro(res, 403, 'Sem permissão');
    if (metodo === 'GET' && !id) return agd.listarAgendamentos(req, res, usuario);
    if (metodo === 'GET' && id === 'beneficio') return agd.consultarBeneficio(req, res);
    if (metodo === 'GET' && id) return agd.obterAgendamento(req, res, usuario, id);
    if (metodo === 'POST' && !id) return agd.criarAgendamento(req, res, usuario);
    if (metodo === 'PUT' && id) return agd.editarAgendamento(req, res, usuario, id);
    if (metodo === 'POST' && id && sub === 'status') return agd.alterarStatus(req, res, usuario, id);
    if (metodo === 'DELETE' && id) return agd.excluirAgendamento(req, res, usuario, id);
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'clube') {
    // área do cliente
    if (pathname === '/api/clube/cliente' && metodo === 'GET') return club.clubeCliente(req, res);
    if (pathname === '/api/clube/cliente/contratar' && metodo === 'POST') return club.contratarCliente(req, res);
    if (pathname === '/api/clube/cliente/cancelar' && metodo === 'POST') return club.cancelarCliente(req, res);
    const mCheckout = pathname.match(/^\/api\/clube\/cliente\/checkout\/(\d+)$/);
    if (mCheckout && metodo === 'GET') return club.consultarCheckout(req, res, Number(mCheckout[1]));
    if (mCheckout && metodo === 'POST') return club.informarPagamentoAssinatura(req, res);
    // painel administrativo
    if (!temPermissao(usuario, 'financeiro')) return erro(res, 403, 'Sem permissão para o clube de assinaturas');
    if (metodo === 'GET' && id === 'planos' && !sub) return club.listarPlanos(req, res);
    if (metodo === 'GET' && id === 'assinaturas' && !sub) return club.listarAssinaturas(req, res);
    if (metodo === 'GET' && id === 'indicadores') return club.indicadores(req, res);
    if (metodo === 'GET' && id === 'assinaturas' && sub) return club.obterAssinatura(req, res, usuario, sub);
    if (metodo === 'POST' && id === 'planos' && !sub) return club.salvarPlano(req, res, usuario, null);
    if (metodo === 'POST' && id === 'planos' && sub) return club.ativarPlano(req, res, usuario, Number(sub));
    if (metodo === 'PUT' && id === 'planos' && sub) return club.salvarPlano(req, res, usuario, Number(sub));
    if (metodo === 'DELETE' && id === 'planos' && sub) return club.excluirPlano(req, res, usuario, Number(sub));
    const mClube = pathname.match(/^\/api\/clube\/assinaturas\/(\d+)\/(status|pagamento)$/);
    if (metodo === 'POST' && mClube) {
      return mClube[2] === 'status'
        ? club.alterarStatusAssinatura(req, res, usuario, Number(mClube[1]))
        : club.confirmarPagamentoAssinatura(req, res, usuario, Number(mClube[1]));
    }
    const mPix = pathname.match(/^\/api\/clube\/assinaturas\/(\d+)\/pix$/);
    if (metodo === 'GET' && mPix) return club.obterPixAssinatura(req, res, usuario, Number(mPix[1]));
    const mUso = pathname.match(/^\/api\/clube\/assinaturas\/(\d+)\/uso$/);
    if (metodo === 'POST' && mUso) return club.ajustarUsoRota(req, res, usuario, Number(mUso[1]));
    if (metodo === 'POST' && id === 'assinaturas' && !sub) return club.contratar(req, res, usuario);
    if (metodo === 'DELETE' && id === 'assinaturas' && sub) return club.excluirAssinatura(req, res, usuario, Number(sub));
    return erro(res, 404, 'Rota do clube não encontrada');
  }

  if (recurso === 'financeiro') {
    if (!temPermissao(usuario, 'financeiro')) return erro(res, 403, 'Sem permissao para o financeiro');
    if (metodo === 'GET' && id === 'resumo') return fin.resumo(req, res);
    if (metodo === 'GET' && !id) return fin.listar(req, res);
    if (metodo === 'POST' && !id) return fin.salvar(req, res, usuario);
    if (metodo === 'PUT' && id && sub !== 'status') return fin.salvar(req, res, usuario, id);
    if (metodo === 'POST' && id && sub === 'status') return fin.alterarStatus(req, res, usuario, id);
    if (metodo === 'DELETE' && id) return fin.excluir(req, res, usuario, id);
    return erro(res, 404, 'Rota financeira nao encontrada');
  }
  if (recurso === 'notificacoes') {
    if (metodo === 'GET' && id === 'agendamentos-pendentes') {
      if (usuario.perfil !== 'admin') return erro(res, 403, 'Somente o administrador pode consultar os pedidos pendentes.');
      return notif.listarAgendamentosPendentes(req, res);
    }
    if (metodo === 'GET') { if (!temPermissao(usuario, 'dashboard')) return erro(res, 403, 'Sem permissão'); return notif.listarNotificacoes(req, res); }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (recurso === 'configuracoes') {
    if (!temPermissao(usuario, 'configuracoes')) return erro(res, 403, 'Sem permissão');
    if (metodo === 'GET' && id === 'estabelecimento') return json(res, 200, getConf('estabelecimento', {}));
    if (metodo === 'GET' && id === 'notificacoes') return json(res, 200, getConf('notificacoes', {}));
    if (metodo === 'PUT' && id === 'estabelecimento') {
      const c = await lerCorpo(req);
      if (Object.hasOwn(c, 'temaId') || Object.hasOwn(c, 'modoAparencia')) {
        if (usuario.perfil !== 'admin') return erro(res, 403, 'Somente o administrador pode alterar a aparência do aplicativo.');
        const temasPermitidos = ['turquesa-rosa', 'azul-oceano', 'lavanda', 'verde-natural', 'rose-elegante', 'grafite-ciano'];
        const modosPermitidos = ['claro', 'escuro', 'dark-night', 'midnight-blue', 'aurora', 'rose-night', 'sistema'];
        if (Object.hasOwn(c, 'temaId') && !temasPermitidos.includes(String(c.temaId))) return erro(res, 400, 'Paleta de cores inválida.');
        if (Object.hasOwn(c, 'modoAparencia') && !modosPermitidos.includes(String(c.modoAparencia))) return erro(res, 400, 'Tema de aparência inválido.');
      }
      setConf('estabelecimento', { ...getConf('estabelecimento', {}), ...c });
      return json(res, 200, { ok: true });
    }
    if (metodo === 'PUT' && id === 'notificacoes') { const c = await lerCorpo(req); setConf('notificacoes', c); return json(res, 200, { ok: true }); }
    return erro(res, 404, 'Rota não encontrada');
  }

  return erro(res, 404, 'Rota não encontrada');
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      const usuario = usuarioDaRequisicao(req);
      return await tratarAPI(req, res, pathname, usuario);
    }
    return servirEstatico(req, res, pathname);
  } catch (e) {
    if (e instanceof ValidationError) return erro(res, e.status || 400, e.message);
    console.error('[erro]', metodo_ou_vazio(req), pathname, e);
    if (!res.headersSent) erro(res, 500, 'Erro interno do servidor');
  }
});

function metodo_ou_vazio() { return ''; }

// roda a geração de lembretes a cada hora
setInterval(() => {
  try { const n = notif.gerarLembretes(); if (n) console.log(`[lembretes] ${n} gerados`); }
  catch (e) { console.error('[lembretes]', e.message); }
}, 60 * 60 * 1000).unref();

setInterval(() => {
  try { pagamentosPix.expirarPendentes(); }
  catch (e) { console.error('[pix-manual]', e.message); }
}, 60 * 1000).unref();

servidor.listen(PORT, () => {
  console.log('==============================================================');
  console.log(`  Agenda+ rodando:  http://localhost:${PORT}`);
  console.log(`  Banco de dados:                  ${DB_PATH}`);
  console.log('  Painel:  http://localhost:' + PORT + '/');
  console.log('  Agendamento online:  http://localhost:' + PORT + '/agendar');
  console.log('==============================================================');
});
