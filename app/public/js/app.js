
// app.js — SPA Agenda (pt-BR)
import { get, post, put, del, UI, setToken, setClientToken, getCliente, postCliente, postPublico } from './api.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = UI.esc;
const fmtData = (d) => d ? d.split('-').reverse().join('/') : '';
const fmtHora = (h) => h ? h.slice(0, 5) : '';
const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtDuracao(minutos) {
  const total = Math.max(0, Math.round(Number(minutos) || 0));
  const horas = Math.floor(total / 60), resto = total % 60;
  if (horas && resto) return `${horas}h ${resto}min`;
  if (horas) return `${horas}h`;
  return `${resto}min`;
}
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const STATUS = { pendente: 'Pendente', confirmado: 'Confirmado', em_atendimento: 'Em atendimento', finalizado: 'Finalizado', falta: 'Falta', cancelado: 'Cancelado' };
const STATUS_CLS = { pendente: 'st-pendente', confirmado: 'st-confirmado', em_atendimento: 'st-em_atendimento', finalizado: 'st-finalizado', falta: 'st-falta', cancelado: 'st-cancelado' };
const TAG_STATUS = { pendente: 'Pendente', confirmado: 'Confirmado', em_atendimento: 'Em atendimento', finalizado: 'Finalizado', falta: 'Falta', cancelado: 'Cancelado' };
const TAG_CLS = { pendente: 'pendente', confirmado: 'confirmado', em_atendimento: 'em_atendimento', finalizado: 'finalizado', falta: 'falta', cancelado: 'cancelado' };
const TEMAS_CORES = {
  'turquesa-rosa': { nome: 'Turquesa e rosa', descricao: 'A combinação do Agenda+: clara, leve e acolhedora.', primaria: '#00aec0', primariaEscura: '#008c9c', acento: '#d84782', fundo: '#f4f4f4', card: '#ffffff', texto: '#1c2430', textoFraco: '#64707d', borda: '#e7e7e7', menu: '#ffffff', menuTexto: '#555555', menuHover: '#f7fbfc', menuAtivo: '#fff7fa', menuAtivoTexto: '#b6346a' },
  'azul-oceano': { nome: 'Azul oceano', descricao: 'Azul e ciano sobre tons frios e suaves.', primaria: '#2878bd', primariaEscura: '#1b5f99', acento: '#00a6b2', fundo: '#f1f6fb', card: '#ffffff', texto: '#203044', textoFraco: '#62748a', borda: '#dce6f0', menu: '#ffffff', menuTexto: '#43556a', menuHover: '#edf5fb', menuAtivo: '#e8f3fc', menuAtivoTexto: '#1b5f99' },
  'lavanda': { nome: 'Lavanda', descricao: 'Roxo e malva com fundo lilás discreto.', primaria: '#7654b5', primariaEscura: '#593b91', acento: '#d65d9c', fundo: '#f6f3fa', card: '#ffffff', texto: '#30283b', textoFraco: '#756a82', borda: '#e6deef', menu: '#ffffff', menuTexto: '#594f66', menuHover: '#f5effa', menuAtivo: '#f1eafa', menuAtivoTexto: '#593b91' },
  'verde-natural': { nome: 'Verde natural', descricao: 'Verde folha com detalhes em dourado suave.', primaria: '#37835e', primariaEscura: '#286445', acento: '#c58b35', fundo: '#f2f7f3', card: '#ffffff', texto: '#26372d', textoFraco: '#68786d', borda: '#dce8df', menu: '#ffffff', menuTexto: '#4c5e52', menuHover: '#edf5ef', menuAtivo: '#e9f3eb', menuAtivoTexto: '#286445' },
  'rose-elegante': { nome: 'Rosé elegante', descricao: 'Rosé e ameixa em uma paleta delicada.', primaria: '#bf4f7b', primariaEscura: '#97395f', acento: '#7653a5', fundo: '#faf4f7', card: '#ffffff', texto: '#392a33', textoFraco: '#806d78', borda: '#ecdee5', menu: '#ffffff', menuTexto: '#66525e', menuHover: '#f9eff4', menuAtivo: '#f6eaf0', menuAtivoTexto: '#97395f' },
  'grafite-ciano': { nome: 'Grafite e ciano', descricao: 'Menu escuro com ciano e rosa em destaque.', primaria: '#08aabd', primariaEscura: '#078091', acento: '#e0528b', fundo: '#eef3f5', card: '#ffffff', texto: '#20303a', textoFraco: '#667780', borda: '#dce5e9', menu: '#172a34', menuTexto: '#d5e1e8', menuHover: '#243c47', menuAtivo: '#244754', menuAtivoTexto: '#ffffff' },
};
const MODOS_APARENCIA = {
  claro: { nome: 'Claro', descricao: 'Fundo claro e cartões brancos.', icone: '☀' },
  escuro: { nome: 'Escuro', descricao: 'Fundo grafite e contraste confortável.', icone: '☾', input: '#23313a', cores: { fundo: '#111a20', card: '#1b2831', texto: '#e7eef2', textoFraco: '#a8b6be', borda: '#34454f', menu: '#15232c', menuTexto: '#d4dfe5', menuHover: '#233640', menuAtivo: '#2d414a', menuAtivoTexto: '#ffffff' } },
  'dark-night': { nome: 'Dark Night', descricao: 'Noite profunda com detalhes luminosos.', icone: '✦', input: '#1b2440', cores: { fundo: '#080b18', card: '#11182b', texto: '#eff0ff', textoFraco: '#a6aac5', borda: '#28324f', menu: '#070a16', menuTexto: '#c5ccea', menuHover: '#171f3a', menuAtivo: '#222c4a', menuAtivoTexto: '#f5f3ff' } },
  'midnight-blue': { nome: 'Midnight Blue', descricao: 'Azul meia-noite com contraste ciano.', icone: '✧', input: '#16293b', cores: { fundo: '#07121e', card: '#0e1e30', texto: '#e6f2ff', textoFraco: '#95acbf', borda: '#23384b', menu: '#06101a', menuTexto: '#c2d4e3', menuHover: '#152a3b', menuAtivo: '#1e3649', menuAtivoTexto: '#edf8ff' } },
  aurora: { nome: 'Aurora Boreal', descricao: 'Verde noturno com tons de floresta.', icone: '✺', input: '#1b322a', cores: { fundo: '#0b1714', card: '#12231f', texto: '#e7f5ee', textoFraco: '#9ab5a9', borda: '#29463b', menu: '#091410', menuTexto: '#cce3d7', menuHover: '#1a3028', menuAtivo: '#233c31', menuAtivoTexto: '#effff5' } },
  'rose-night': { nome: 'Rosé Noturno', descricao: 'Ameixa escura com acentos rosados.', icone: '✦', input: '#382234', cores: { fundo: '#1a0e1a', card: '#281626', texto: '#f8eaf3', textoFraco: '#c6a9bb', borda: '#4a2c43', menu: '#160b16', menuTexto: '#ead1e1', menuHover: '#352033', menuAtivo: '#482542', menuAtivoTexto: '#fff0f8' } },
  sistema: { nome: 'Seguir o sistema', descricao: 'Usa o modo claro ou escuro do dispositivo.', icone: '◐', input: '#23313a', cores: { fundo: '#111a20', card: '#1b2831', texto: '#e7eef2', textoFraco: '#a8b6be', borda: '#34454f', menu: '#15232c', menuTexto: '#d4dfe5', menuHover: '#233640', menuAtivo: '#2d414a', menuAtivoTexto: '#ffffff' } },
};
const VARIAVEIS_TEMA = {
  primaria: '--primaria', primariaEscura: '--primaria-escura', acento: '--cor-acento',
  fundo: '--fundo', card: '--card', texto: '--texto', textoFraco: '--texto-fraco', borda: '--borda',
  menu: '--menu-bg', menuTexto: '--menu-texto', menuHover: '--menu-hover', menuAtivo: '--menu-ativo', menuAtivoTexto: '--menu-ativo-texto',
};
let temaIdAtivo = 'turquesa-rosa';
let modoAparenciaAtivo = 'claro';
const preferenciaAparenciaSistema = window.matchMedia?.('(prefers-color-scheme: dark)');
function aplicarTemaCores(id, modo = 'claro') {
  const temaId = Object.hasOwn(TEMAS_CORES, id) ? id : 'turquesa-rosa';
  const tema = TEMAS_CORES[temaId];
  const modoId = Object.hasOwn(MODOS_APARENCIA, modo) ? modo : 'claro';
  const escuro = ['escuro', 'dark-night', 'midnight-blue', 'aurora', 'rose-night'].includes(modoId) ||
    (modoId === 'sistema' && Boolean(preferenciaAparenciaSistema?.matches));
  const cores = escuro ? { ...tema, ...MODOS_APARENCIA[modoId].cores } : tema;
  for (const [campo, variavel] of Object.entries(VARIAVEIS_TEMA)) document.documentElement.style.setProperty(variavel, cores[campo]);
  document.documentElement.style.setProperty('--input-bg', escuro ? MODOS_APARENCIA[modoId].input : '#ffffff');
  document.documentElement.style.setProperty('--acao-primaria', tema.primaria);
  document.documentElement.style.setProperty('--acao-acento', tema.acento);
  document.documentElement.dataset.tema = temaId;
  document.documentElement.dataset.aparencia = modoId;
  document.documentElement.dataset.temaEscuro = escuro ? 'true' : 'false';
  temaIdAtivo = temaId;
  modoAparenciaAtivo = modoId;
  return temaId;
}
preferenciaAparenciaSistema?.addEventListener('change', () => {
  if (modoAparenciaAtivo === 'sistema') aplicarTemaCores(temaIdAtivo, 'sistema');
});
async function carregarTemaSalvo() {
  try {
    const config = await get('/api/publico/config');
    aplicarTemaCores(config.temaId, config.modoAparencia);
  } catch { aplicarTemaCores('turquesa-rosa', 'claro'); }
}
const TRANSICOES_STATUS = {
  pendente: ['confirmado', 'cancelado', 'falta'],
  confirmado: ['em_atendimento', 'cancelado', 'falta'],
  em_atendimento: ['finalizado', 'falta'],
  finalizado: [],
  falta: [],
  cancelado: ['pendente'],
};

let state = { user: null, cliente: null, rota: '', params: {}, cache: {}, publico: null };
const INTERVALO_ALERTA_AGENDAMENTO = 5000;
const monitorAgendamentos = {
  timer: null, busy: false, geracao: 0, pedidos: [], assinatura: '',
  audio: null, audioLiberado: false, audioIndisponivel: false, somTimer: null,
};

function toast(msg, tipo = 'ok') {
  UI.toast(msg, tipo === 'ok' ? 'sucesso' : tipo === 'erro' ? 'erro' : 'info');
}
function loading(on) { document.body.classList.toggle('carregando', !!on); }
async function withLoading(fn) {
  loading(true);
  try { return await fn(); } catch (e) { toast(e.message || 'Erro inesperado', 'erro'); }
  finally { loading(false); }
}
function confirmar(msg) { return window.confirm(msg); }
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function tagStatus(st) {
  return `<span class="tag ${TAG_CLS[st] || ''}">${TAG_STATUS[st] || st}</span>`;
}

function agruparServicosPorCategoria(servicos) {
  const grupos = new Map();
  for (const servico of servicos) {
    const categoria = String(servico.categoria || '').trim() || 'Sem categoria';
    const chave = categoria.toLocaleLowerCase('pt-BR');
    if (!grupos.has(chave)) grupos.set(chave, { categoria, servicos: [] });
    grupos.get(chave).servicos.push(servico);
  }
  return [...grupos.values()]
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR', { sensitivity: 'base' }))
    .map((grupo) => ({
      ...grupo,
      servicos: grupo.servicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    }));
}

function tocarSomAgendamento() {
  const audio = monitorAgendamentos.audio;
  if (!audio || audio.state !== 'running' || !monitorAgendamentos.pedidos.length) return;
  [740, 880, 740].forEach((frequencia, indice) => {
    const inicio = audio.currentTime + 0.03 + indice * 0.24;
    const oscilador = audio.createOscillator();
    const volume = audio.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.setValueAtTime(frequencia, inicio);
    volume.gain.setValueAtTime(0.0001, inicio);
    volume.gain.exponentialRampToValueAtTime(0.42, inicio + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.19);
    oscilador.connect(volume);
    volume.connect(audio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.21);
  });
}

function pararSomAgendamento() {
  if (monitorAgendamentos.somTimer) clearInterval(monitorAgendamentos.somTimer);
  monitorAgendamentos.somTimer = null;
}

function iniciarSomAgendamento() {
  if (!monitorAgendamentos.audioLiberado || monitorAgendamentos.somTimer || !monitorAgendamentos.pedidos.length) return;
  tocarSomAgendamento();
  monitorAgendamentos.somTimer = setInterval(tocarSomAgendamento, 4200);
}

async function desbloquearSomAgendamento() {
  if (monitorAgendamentos.audioLiberado || monitorAgendamentos.audioIndisponivel) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    monitorAgendamentos.audioIndisponivel = true;
    return;
  }
  try {
    if (!monitorAgendamentos.audio) {
      monitorAgendamentos.audio = new AudioContext();
      monitorAgendamentos.audio.addEventListener('statechange', () => {
        monitorAgendamentos.audioLiberado = monitorAgendamentos.audio.state === 'running';
        if (monitorAgendamentos.audioLiberado) iniciarSomAgendamento();
        else pararSomAgendamento();
      });
    }
    await monitorAgendamentos.audio.resume();
    monitorAgendamentos.audioLiberado = monitorAgendamentos.audio.state === 'running';
    if (monitorAgendamentos.audioLiberado) iniciarSomAgendamento();
  } catch {
    monitorAgendamentos.audioLiberado = false;
  }
}

document.addEventListener('pointerdown', () => { void desbloquearSomAgendamento(); }, true);
document.addEventListener('keydown', () => { void desbloquearSomAgendamento(); }, true);

function renderAlertaAgendamentos() {
  const caixa = $('#alerta-agendamentos-online');
  if (!caixa) return;
  const pedidos = monitorAgendamentos.pedidos;
  if (!pedidos.length) {
    caixa.classList.remove('ativo'); caixa.innerHTML = ''; monitorAgendamentos.assinatura = ''; pararSomAgendamento(); return;
  }
  const assinatura = pedidos.map((a) => [a.tipo, a.id, a.cliente, a.servico, a.data, a.hora_inicio].join(':')).join('|') +
    ':' + monitorAgendamentos.audioLiberado + ':' + monitorAgendamentos.audioIndisponivel;
  if (assinatura === monitorAgendamentos.assinatura && caixa.classList.contains('ativo')) return;
  monitorAgendamentos.assinatura = assinatura;
  const titulo = pedidos.length === 1 ? '1 item Pix precisa de confer\u00eancia' : pedidos.length + ' itens Pix precisam de confer\u00eancia';
  const textoSom = monitorAgendamentos.audioIndisponivel ? 'Este navegador n\u00e3o disponibiliza o alerta sonoro.' :
    monitorAgendamentos.audioLiberado ? 'O alerta se repetir\u00e1 at\u00e9 confirmar/cancelar os agendamentos e registrar as devolu\u00e7\u00f5es.' :
      'Ative o som para ouvir o alerta enquanto o aplicativo estiver aberto.';
  const botaoSom = !monitorAgendamentos.audioLiberado && !monitorAgendamentos.audioIndisponivel
    ? '<button type="button" class="btn mini" data-alerta-som>Ativar som</button>' : '';
  const linhas = pedidos.map((a) => {
    if (a.tipo === 'reembolso') {
      return '<article class="alerta-agendamento-item">' +
        '<div class="alerta-agendamento-detalhes"><strong>Devolu\u00e7\u00e3o Pix \u00b7 ' + esc(a.cliente) + '</strong>' +
        '<span>' + esc(a.servico) + ' \u00b7 ' + fmtData(a.data) + ' ' + fmtHora(a.hora_inicio) + ' \u00b7 devolver ' + fmtBRL(a.valor_sinal_centavos / 100) + '</span>' +
        '<span>Fa\u00e7a a devolu\u00e7\u00e3o pelo banco; depois marque como conclu\u00edda.</span></div>' +
        '<div class="alerta-agendamento-acoes"><button type="button" class="btn ok mini" data-alerta-reembolso="' + Number(a.id) + '">Marcar devolu\u00e7\u00e3o feita</button></div></article>';
    }
    const id = Number(a.id);
    return '<article class="alerta-agendamento-item">' +
      '<div class="alerta-agendamento-detalhes"><strong>Pix informado \u00b7 ' + esc(a.cliente) + ' \u00b7 ' + esc(a.servico) + '</strong>' +
      '<span>' + esc(fmtData(a.data)) + ' \u00e0s ' + esc(fmtHora(a.hora_inicio)) + ' \u00b7 ' + esc(a.profissional) + ' \u00b7 sinal ' + fmtBRL(a.valor_sinal_centavos / 100) + '</span>' +
      '<span>Confira o cr\u00e9dito no banco antes de confirmar o hor\u00e1rio.</span></div>' +
      '<div class="alerta-agendamento-acoes">' +
      '<a class="btn btn-sec mini" href="#/agenda?data=' + encodeURIComponent(a.data) + '">Abrir agenda</a>' +
      '<button type="button" class="btn ok mini" data-alerta-status="confirmado" data-alerta-id="' + id + '">Pix recebido \u00b7 confirmar</button>' +
      '<button type="button" class="btn perigo mini" data-alerta-status="cancelado" data-pix-recebido="1" data-alerta-id="' + id + '">Recebi o Pix \u00b7 cancelar e devolver</button>' +
      '<button type="button" class="btn btn-sec mini" data-alerta-status="cancelado" data-alerta-id="' + id + '">N\u00e3o recebi \u00b7 cancelar</button>' +
      '</div></article>';
  }).join('');
  caixa.classList.add('ativo');
  caixa.innerHTML = '<div class="alerta-agendamentos-cabecalho"><div><strong>' + titulo + '</strong><span>' + textoSom +
    '</span></div>' + botaoSom + '</div><div class="alerta-agendamentos-lista">' + linhas + '</div>';
}
async function atualizarAlertasAgendamentos() {
  if (monitorAgendamentos.busy || state.user?.perfil !== 'admin') return;
  const geracao = monitorAgendamentos.geracao;
  monitorAgendamentos.busy = true;
  try {
    const pedidos = await get('/api/notificacoes/agendamentos-pendentes');
    if (geracao !== monitorAgendamentos.geracao || state.user?.perfil !== 'admin') return;
    monitorAgendamentos.pedidos = Array.isArray(pedidos) ? pedidos : [];
    if (monitorAgendamentos.pedidos.length) iniciarSomAgendamento();
    renderAlertaAgendamentos();
  } catch {
    if (!localStorage.getItem('ag_token')) pararMonitorAgendamentos();
  } finally {
    if (geracao === monitorAgendamentos.geracao) monitorAgendamentos.busy = false;
  }
}

function iniciarMonitorAgendamentos() {
  if (state.user?.perfil !== 'admin') {
    pararMonitorAgendamentos();
    return;
  }
  if (monitorAgendamentos.timer) return;
  void atualizarAlertasAgendamentos();
  monitorAgendamentos.timer = setInterval(atualizarAlertasAgendamentos, INTERVALO_ALERTA_AGENDAMENTO);
}

function pararMonitorAgendamentos() {
  monitorAgendamentos.geracao++;
  if (monitorAgendamentos.timer) clearInterval(monitorAgendamentos.timer);
  monitorAgendamentos.timer = null;
  monitorAgendamentos.busy = false;
  monitorAgendamentos.pedidos = [];
  monitorAgendamentos.assinatura = '';
  pararSomAgendamento();
  renderAlertaAgendamentos();
}

async function tratarCliqueAlertaAgendamentos(evento) {
  const botaoSom = evento.target.closest('[data-alerta-som]');
  if (botaoSom) { await desbloquearSomAgendamento(); renderAlertaAgendamentos(); return; }
  const botaoReembolso = evento.target.closest('[data-alerta-reembolso]');
  if (botaoReembolso) {
    if (!confirmar('Marque a devolu\u00e7\u00e3o somente depois de enviar o Pix pelo banco.')) return;
    botaoReembolso.disabled = true;
    try {
      await post('/api/pagamentos/devolucoes/' + Number(botaoReembolso.dataset.alertaReembolso) + '/confirmar', {});
      toast('Devolu\u00e7\u00e3o registrada.', 'ok'); await atualizarAlertasAgendamentos();
    } catch (erro) { toast(erro.message || 'N\u00e3o foi poss\u00edvel registrar a devolu\u00e7\u00e3o.', 'erro'); botaoReembolso.disabled = false; }
    return;
  }
  const botao = evento.target.closest('[data-alerta-status]');
  if (!botao) return;
  const id = Number(botao.dataset.alertaId), status = botao.dataset.alertaStatus;
  const pixRecebido = botao.dataset.pixRecebido === '1';
  if (!id || !['confirmado', 'cancelado'].includes(status)) return;
  const pedido = monitorAgendamentos.pedidos.find((a) => a.tipo === 'agendamento' && Number(a.id) === id);
  if (status === 'confirmado' && !confirmar('Confirme somente depois de verificar no extrato que o sinal Pix foi recebido.')) return;
  if (status === 'cancelado' && pedido && pixRecebido && !confirmar('Confirma que o Pix caiu no extrato? O hor\u00e1rio ser\u00e1 cancelado e uma devolu\u00e7\u00e3o integral ficar\u00e1 pendente para fazer pelo banco.')) return;
  if (status === 'cancelado' && pedido && !pixRecebido && !confirmar('Cancelar sem registrar recebimento Pix? Use a outra op\u00e7\u00e3o se o valor apareceu no extrato.')) return;
  botao.disabled = true;
  try {
    const resultado = await post('/api/agendamentos/' + id + '/status', { status, pixRecebido });
    toast(resultado.aviso || (status === 'confirmado' ? 'Pix conferido e agendamento confirmado.' : 'Agendamento cancelado.'), resultado.aviso ? 'info' : 'ok');
    await atualizarAlertasAgendamentos();
  } catch (erro) { toast(erro.message || 'N\u00e3o foi poss\u00edvel atualizar o agendamento.', 'erro'); botao.disabled = false; }
}// ==================== LAYOUT ====================
function layout(conteudo, menuAtivo) {
  const u = state.user;
  const financeiroVisivel = ['admin', 'gestor'].includes(u.perfil);
  $('#app').innerHTML = `
 <div class="layout">
    <button class="menu-flutuante" id="btn-menu" aria-label="Abrir menu" aria-expanded="false">☰</button>
    <div class="menu-fundo" id="menu-fundo"></div>
    <aside class="sidebar" id="sidebar">
      <div class="logo">Agenda<span>+</span></div>
      <nav>
        <a href="#/dashboard" class="${menuAtivo === 'dashboard' ? 'ativo' : ''}"><span class="nav-icon">⌂</span> Início</a>
        <a href="#/agenda" class="${menuAtivo === 'agenda' ? 'ativo' : ''}"><span class="nav-icon">▦</span> Agenda</a>
        <a href="#/clientes" class="${menuAtivo === 'clientes' ? 'ativo' : ''}"><span class="nav-icon">♙</span> Clientes</a>
        ${financeiroVisivel ? `<a href="#/financeiro" class="${menuAtivo === 'financeiro' ? 'ativo' : ''}"><span class="nav-icon">$</span> Financeiro</a>` : ''}
        <a href="#/profissionais" class="${menuAtivo === 'profissionais' ? 'ativo' : ''}"><span class="nav-icon">♟</span> Profissionais</a>
        <a href="#/servicos" class="${menuAtivo === 'servicos' ? 'ativo' : ''}"><span class="nav-icon">◇</span> Serviços e preços</a>
        ${financeiroVisivel ? `<a href="#/clube" class="${menuAtivo === 'clube' ? 'ativo' : ''}"><span class="nav-icon">★</span> Clube de Assinaturas</a>` : ''}
        ${financeiroVisivel ? `
        <a href="#/salas" class="${menuAtivo === 'salas' ? 'ativo' : ''}"><span class="nav-icon">▤</span> Salas</a>
        <a href="#/bloqueios" class="${menuAtivo === 'bloqueios' ? 'ativo' : ''}"><span class="nav-icon">◫</span> Bloqueios</a>
        <a href="#/configuracoes" class="${menuAtivo === 'configuracoes' ? 'ativo' : ''}"><span class="nav-icon">⚙</span> Configurações</a>
        <a href="#/usuarios" class="${menuAtivo === 'usuarios' ? 'ativo' : ''}"><span class="nav-icon">♧</span> Usuários</a>` : ''}
        <a href="/agendar" target="_blank"><span class="nav-icon">↗</span> Agendamento online</a>
      </nav>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <form id="busca-global" class="global-search" role="search">
          <input id="busca-global-campo" type="search" placeholder="Busque por nomes ou dados..." aria-label="Buscar clientes">
          <button type="submit" aria-label="Buscar">⌕</button>
        </form>
        <div class="topbar-user">
          <span class="avatar">${esc(u.nome.slice(0, 1).toUpperCase())}</span>
          <span class="topbar-user-name">${esc(u.nome)}</span>
          <button class="btn btn-sec mini" id="btn-sair">Sair</button>
        </div>
      </header>
      <div id="alerta-agendamentos-online" class="alerta-agendamentos" role="alert" aria-live="assertive"></div>
      <main class="conteudo" id="pagina">${conteudo}</main>
    </section>
 </div>`;
  const navPrincipal = $('.sidebar nav');
  // Drawer do menu em telas pequenas
  const btnMenu = $('#btn-menu');
  const fundoMenu = $('#menu-fundo');
  const alternarMenu = (abrir) => {
    const aberto = abrir ?? !document.body.classList.contains('menu-aberto');
    document.body.classList.toggle('menu-aberto', aberto);
    btnMenu.setAttribute('aria-expanded', String(aberto));
  };
  btnMenu.addEventListener('click', () => alternarMenu());
  if (fundoMenu) {
    fundoMenu.addEventListener('click', () => alternarMenu(false));
    navPrincipal.addEventListener('click', (e) => {
      if (e.target.closest('a')) alternarMenu(false);
    });
  }
  if (state.user.perfil === 'admin') {
    const linkDados = document.createElement('a');
    linkDados.href = '#/dados-iniciais';
    linkDados.className = menuAtivo === 'dados-iniciais' ? 'ativo' : '';
    linkDados.textContent = 'Limpar dados iniciais';
    navPrincipal.append(linkDados);
  }
  const alertaAgendamentos = $('#alerta-agendamentos-online');
  if (alertaAgendamentos) {
    alertaAgendamentos.addEventListener('click', tratarCliqueAlertaAgendamentos);
    renderAlertaAgendamentos();
  }
  $('#btn-sair').onclick = sair;
  $('#busca-global').onsubmit = (e) => {
    e.preventDefault();
    const busca = $('#busca-global-campo').value.trim();
    location.hash = busca ? `#/clientes?busca=${encodeURIComponent(busca)}` : '#/clientes';
  };
}
async function sair() {
  pararMonitorAgendamentos();
  try { await post('/api/logout'); } catch { /* sessão já expirada */ }
  setToken(null);
  state.user = null;
  sessionStorage.removeItem('usuario');
  location.hash = '#/login';
}

// ==================== LOGIN / CADASTRO ====================
function definirSessao(r) {
  if (!r?.token || !r?.usuario) throw new Error('A API n\u00e3o retornou uma sess\u00e3o v\u00e1lida.');
  setToken(r.token);
  sessionStorage.setItem('usuario', JSON.stringify(r.usuario));
  state.user = r.usuario;
}

function telaLogin() {
  $('#app').innerHTML = '<div class="auth-wrap"><div class="auth-card">' +
    '<div class="auth-logo">Agenda<span>+</span></div><h2>Entrar</h2>' +
    '<p class="texto-fraco">Informe seu e-mail e sua senha para continuar.</p>' +
    '<form id="form-auth">' +
    '<label>E-mail<input name="email" type="email" required autocomplete="username"></label>' +
    '<label>Senha<input name="senha" type="password" required autocomplete="current-password"></label>' +
    '<button class="btn btn-primario" style="width:100%">Entrar</button></form>' +
    '<div class="auth-links"><a href="#/cliente-cadastro">Criar conta</a> · <a href="/agendar">Agendar um serviço</a></div>' +
    '</div></div>';
  $('#form-auth').onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    await withLoading(async () => {
      setToken(null);
      setClientToken(null);
      sessionStorage.removeItem('usuario');
      sessionStorage.removeItem('cliente');
      const sessao = await post('/api/login', corpo);
      if (sessao.tipo === 'cliente') {
        setClientToken(sessao.token);
        state.cliente = sessao.cliente;
        sessionStorage.setItem('cliente', JSON.stringify(sessao.cliente));
        location.hash = '#/minha-conta';
      } else {
        definirSessao(sessao);
        location.hash = '#/dashboard';
      }
    });
  };
}
function telaCadastroCliente() {
  $('#app').innerHTML = '<div class="auth-wrap"><div class="auth-card">' +
    '<div class="auth-logo">Agenda<span>+</span></div><h2>Criar acesso de cliente</h2>' +
    '<p class="texto-fraco">Use o mesmo telefone informado à clínica para vincular um cadastro existente.</p>' +
    '<form id="form-cliente">' +
    '<label>Nome completo<input name="nome" required autocomplete="name"></label>' +
    '<label>E-mail<input name="email" type="email" required autocomplete="email"></label>' +
    '<label>Telefone / WhatsApp<input name="telefone" required autocomplete="tel"></label>' +
    '<label>Data de nascimento<input name="data_nascimento" type="date"></label>' +
    '<label>Senha (mínimo 8 caracteres)<input name="senha" type="password" required minlength="8" autocomplete="new-password"></label>' +
    '<button class="btn btn-primario" style="width:100%">Criar acesso</button></form>' +
    '<div class="auth-links"><a href="#/login">Já tenho conta</a> · <a href="/agendar">Voltar ao agendamento</a></div></div></div>';
  $('#form-cliente').onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    await withLoading(async () => {
      setToken(null);
      sessionStorage.removeItem('usuario');
      const sessao = await postCliente('/api/cliente/registrar', corpo);
      setClientToken(sessao.token);
      sessionStorage.setItem('cliente', JSON.stringify(sessao.cliente));
      state.cliente = sessao.cliente;
      toast('Acesso de cliente criado.', 'ok');
      location.hash = '#/minha-conta';
    });
  };
}

async function paginaContaCliente() {
  try {
    const cliente = await getCliente('/api/cliente/atual');
    const agendamentos = await getCliente('/api/cliente/agendamentos');
    state.cliente = cliente;
    sessionStorage.setItem('cliente', JSON.stringify(cliente));
    const status = { pendente: 'Pendente', confirmado: 'Confirmado', em_atendimento: 'Em atendimento', finalizado: 'Finalizado', falta: 'Falta', cancelado: 'Cancelado' };
    const statusPix = { aguardando: 'Pix aguardando conferência', pago: 'Pix conferido pela clínica', reembolso_pendente: 'Devolução Pix pendente', reembolso_parcial: 'Devolução parcial concluída', reembolsado: 'Devolução concluída', retido: 'Sinal retido conforme a regra' };
    const linhas = agendamentos.length ? agendamentos.map((a) =>
      '<tr><td>' + fmtData(a.data) + ' ' + fmtHora(a.hora_inicio) + '</td><td>' + esc(a.servico) +
      '</td><td>' + esc(a.profissional) + '</td><td>' + fmtBRL(a.preco_centavos / 100) +
      '</td><td>' + esc(status[a.status] || a.status) + (a.pix_status ? '<small>' + esc(statusPix[a.pix_status] || a.pix_status) + '</small>' : '') + '</td><td>' +
      (['pendente', 'confirmado'].includes(a.status) ? '<button class="btn mini btn-sec" data-cancelar="' + a.id + '">Cancelar</button>' : '') +
      '</td></tr>').join('') : '<tr><td colspan="6" class="vazio">Você ainda não tem agendamentos.</td></tr>';
    $('#app').innerHTML = '<div class="client-shell"><header><a class="auth-logo" href="/">Agenda<span>+</span></a>' +
      '<nav><a class="btn btn-sec" href="#/meu-clube">Meu clube</a><a class="btn btn-sec" href="/agendar">Agendar serviço</a><button class="btn btn-sec" id="sair-cliente">Sair</button></nav></header>' +
      '<main><div class="topo"><div><h1>Olá, ' + esc(cliente.nome) + '</h1><p class="texto-fraco">Sua conta de cliente e seus agendamentos.</p></div></div>' +
      '<section class="card"><h2>Meus agendamentos</h2><div class="tabela-responsiva"><table><thead><tr><th>Data</th><th>Serviço</th><th>Profissional</th><th>Preço</th><th>Status</th><th></th></tr></thead><tbody>' +
      linhas + '</tbody></table></div></section></main></div>';
    $('#sair-cliente').onclick = async () => {
      try { await postCliente('/api/cliente/logout', {}); } catch { }
      setClientToken(null);
      sessionStorage.removeItem('cliente');
      state.cliente = null;
      location.hash = '#/login';
    };
    $$('[data-cancelar]').forEach((botao) => botao.onclick = async () => {
      if (!confirmar('Cancelar este agendamento?')) return;
      await withLoading(async () => {
        const resultado = await postCliente('/api/cliente/agendamentos/' + botao.dataset.cancelar + '/cancelar', {});
        const mensagem = resultado.statusReembolso === 'manual_pendente'
          ? 'Cancelado. A clínica precisa devolver ' + fmtBRL(resultado.reembolsoCentavos / 100) + ' pelo banco.'
          : resultado.retidoCentavos > 0 ? 'Cancelado. Valor retido: ' + fmtBRL(resultado.retidoCentavos / 100) + '.' : 'Agendamento cancelado.';
        toast(mensagem, resultado.statusReembolso === 'manual_pendente' ? 'info' : 'ok');
        await paginaContaCliente();
      });
    });
  } catch {
    state.cliente = null;
    sessionStorage.removeItem('cliente');
    location.hash = '#/login';
  }
}

// ==================== MEU CLUBE DE ASSINATURAS (CLIENTE) ====================
function mostrarCheckoutPix(checkout, planoId, mensagem) {
  const m = UI.modal(`
    <h2>Pagamento via Pix</h2>
    <p class='texto-fraco'>${esc(mensagem || 'Escaneie o QR Code ou copie o código abaixo.')}</p>
    <div id='pix-qr-container' style='text-align:center;padding:20px;'><img src='${checkout.pixQrDataUri}' alt='QR Pix' style='max-width:280px;'></div>
    <div style='background:#f5f5f5;padding:12px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:12px;margin:12px 0;'>${esc(checkout.pixCopiaECola)}</div>
    <button class='btn btn-sec' id='pix-copiar' style='width:100%'>Copiar código Pix</button>
    <button class='btn btn-primario' id='pix-ja-paguei' style='width:100%;margin-top:10px'>Já paguei</button>
    <p class='texto-fraco' style='text-align:center;margin-top:12px;font-size:12px;'>A clínica confirmará em até 5 minutos. Esta tela atualiza automaticamente.</p>
    <div class='modal-rodape'><button class='btn btn-sec' id='pix-fechar'>Fechar</button></div>
  `);
  $('#pix-copiar', m).onclick = async () => {
    try { await navigator.clipboard.writeText(checkout.pixCopiaECola); toast('Código copiado!', 'ok'); }
    catch { toast('Não foi possível copiar.', 'erro'); }
  };
  $('#pix-ja-paguei', m).onclick = async () => {
    await withLoading(async () => {
      try {
        await postCliente('/api/clube/cliente/checkout/' + checkout.assinatura_id + '/informar', { token: checkout.checkoutToken, assinatura_id: checkout.assinatura_id });
        toast('Aviso registrado. Aguardando confirmação.', 'ok');
        $('#pix-ja-paguei', m).disabled = true;
        $('#pix-ja-paguei', m).textContent = 'Aviso enviado';
      } catch (e) { toast(e.message || 'Erro', 'erro'); }
    });
  };
  $('#pix-fechar', m).onclick = () => { if (pollingPix) clearInterval(pollingPix); m.remove(); paginaClubeCliente(); };
  let tentativas = 0;
  const pollingPix = setInterval(async () => {
    tentativas++;
    try {
      const r = await getCliente('/api/clube/cliente/checkout/' + checkout.assinatura_id + '?token=' + checkout.checkoutToken);
      if (r.status === 'pago' || r.statusAssinatura === 'ativa') {
        clearInterval(pollingPix);
        toast('Pagamento confirmado! Clube ativado.', 'ok');
        m.remove();
        paginaClubeCliente();
      } else if (r.status === 'expirado') {
        clearInterval(pollingPix);
        toast('O Pix expirou. Tente contratar novamente.', 'erro');
        m.remove();
        paginaClubeCliente();
      } else if (tentativas >= 12) {
        clearInterval(pollingPix);
        toast('Tempo limite. Verifique em Meu Clube.', 'info');
      }
    } catch {}
  }, 5 * 60 * 1000);
}
async function paginaClubeCliente() {
  try {
    const cliente = await getCliente('/api/cliente/atual');
    const dados = await getCliente('/api/cliente/clube');
    state.cliente = cliente;
    sessionStorage.setItem('cliente', JSON.stringify(cliente));
    const a = dados.assinatura;
    const statusLabels = { pendente: 'Aguardando pagamento', ativa: 'Ativa', cancelada: 'Cancelada', cancelamento_solicitado: 'Cancelamento em análise' };
    const cardsPlanos = dados.planos.map((p) => {
      const contratado = a && a.plano_id === p.id;
      return `<div class="card plano-card clube-cliente ${contratado ? 'plano-contratado' : ''}">
        <div class="plano-topo"><h3>${esc(p.nome)}</h3>${contratado ? '<span class="plano-badge ativo">Seu plano</span>' : ''}</div>
        <p class="texto-fraco">${esc(p.descricao || '')}</p>
        <div class="plano-preco">${centavos(p.mensalidade_centavos)}<small>/mês</small></div>
        <div class="plano-meta"><span>Avulso: ${centavos(p.avulso_centavos)}</span><span class="plano-economia">Você economiza ${centavos(p.economia_centavos)}</span>${p.desconto_adicional_pct ? `<span>· ${p.desconto_adicional_pct}% off em serviços extras</span>` : ''}</div>
        <div class="plano-itens">${p.itens.map((i) => `<div><span>${i.quantidade}×</span> ${esc(i.servico)} <small>${centavos(i.preco_centavos)} avulso</small></div>`).join('')}</div>
        ${contratado ? '' : `<button class="btn btn-primario" data-contratar="${p.id}">Contratar</button>`}
      </div>`;
    }).join('');

    $('#app').innerHTML = '<div class="client-shell"><header><a class="auth-logo" href="/">Agenda<span>+</span></a>' +
      '<nav><a class="btn btn-sec" href="#/minha-conta">Minha conta</a><a class="btn btn-sec" href="/agendar">Agendar serviço</a><button class="btn btn-sec" id="sair-cliente">Sair</button></nav></header>' +
      '<main><div class="topo"><div><h1>Meu Clube de Assinaturas</h1><p class="texto-fraco">Planos de mensalidade com serviços incluídos todo mês.</p></div></div>' +
      (a ? `<section class="card assinatura-atual ${a.status === 'ativa' ? 'ativa' : ''}">
        <h2>${esc(a.plano)} · <span class="tag-assin ${a.status}">${statusLabels[a.status] || a.status}</span></h2>
        <div class="assinatura-meta">
          <div><small>Mensalidade</small><b>${centavos(a.mensalidade_centavos)}</b></div>
          ${a.ciclo ? `<div><small>Ciclo atual</small><b>${fmtData(a.ciclo.inicio_em)} – ${fmtData(a.ciclo.fim_em)}</b></div>` : ''}
          ${a.ciclo && a.ciclo.status === 'aguardando_pagamento' ? '<div><small>Pagamento</small><b class="erro">Aguardando confirmação da clínica</b></div>' : ''}
          ${a.desconto_adicional_pct ? `<div><small>Desconto extra</small><b>${a.desconto_adicional_pct}%</b></div>` : ''}
        </div>
        <h3>Procedimentos do ciclo</h3>
        <div class="tabela-responsiva"><table><thead><tr><th>Serviço</th><th>Contratado</th><th>Usados</th><th>Restantes</th></tr></thead><tbody>
        ${a.beneficios.map((b) => `<tr><td>${esc(b.servico)}</td><td>${b.quantidade}</td><td>${b.usados}</td><td><b>${b.quantidade - b.usados - b.reservados}</b></td></tr>`).join('') || '<tr><td colspan="4" class="vazio">—</td></tr>'}
        </tbody></table></div>
        <h3>Histórico de utilização</h3>
        <div class="tabela-responsiva"><table><thead><tr><th>Data</th><th>Serviço</th><th>Ação</th></tr></thead><tbody>
        ${a.utilizacao.map((u) => `<tr><td>${u.ag_data ? `${fmtData(u.ag_data)} ${fmtHora(u.hora_inicio)}` : '—'}</td><td>${esc(u.servico)}</td><td>${({ reservado: 'Reservado', consumido: 'Utilizado', liberado: 'Liberado' }[u.acao] || u.acao)}</td></tr>`).join('') || '<tr><td colspan="3" class="vazio">Nenhuma utilização ainda.</td></tr>'}
        </tbody></table></div>
        ${a.status === 'ativa' || a.status === 'pendente' ? `<button class="btn btn-perigo" id="cancelar-assinatura">Solicitar cancelamento</button>` : ''}
      </section>` : '') +
      '<section class="dash-section"><h2>Planos disponíveis</h2><div class="planos-grid">' + cardsPlanos + '</div></section>' +
      '<div style="margin-top:20px;text-align:center;"><a class="btn btn-sec" href="/#/minha-conta">← Voltar</a></div></main></div>';

    $('#sair-cliente').onclick = async () => {
      try { await postCliente('/api/cliente/logout', {}); } catch { }
      setClientToken(null); sessionStorage.removeItem('cliente'); state.cliente = null; location.hash = '#/login';
    };
    $$('[data-contratar]').forEach((b) => b.onclick = async () => {
      if (!confirmar('Contratar este plano? A mensalidade será cobrada conforme a confirmação da clínica.')) return;
      await withLoading(async () => {
        const r = await postCliente('/api/cliente/clube/contratar', { plano_id: Number(b.dataset.contratar) });
        toast(r.mensagem || 'Plano contratado!', 'ok');
        paginaClubeCliente();
      });
    });
    const btnCancelar = $('#cancelar-assinatura');
    if (btnCancelar) btnCancelar.onclick = async () => {
      if (!confirmar('Solicitar o cancelamento da sua assinatura?')) return;
      await withLoading(async () => {
        const r = await postCliente('/api/cliente/clube/cancelar', { assinatura_id: a.id });
        toast(r.mensagem || 'Solicitação registrada.', 'info');
        paginaClubeCliente();
      });
    };
  } catch {
    state.cliente = null; sessionStorage.removeItem('cliente'); location.hash = '#/login';
  }
}

function telaRecuperar() {
  $('#app').innerHTML = `
 <div class="auth-wrap"><div class="auth-card">
    <h2>Recuperar acesso</h2>
    <p class="texto-fraco">Informe seu e-mail para gerar um token de recuperação.</p>
    <form id="f1">
      <label>E-mail<input name="email" type="email" required></label>
      <button class="btn btn-primario" style="width:100%">Gerar token</button>
    </form>
    <div id="passo2" style="display:none">
      <form id="f2">
        <label>Token<input name="token" required></label>
        <label>Nova senha<input name="senha" type="password" required minlength="8"></label>
        <button class="btn btn-primario" style="width:100%">Redefinir senha</button>
      </form>
    </div>
    <div class="auth-links"><a href="#/login">Voltar ao login</a></div>
 </div></div>`;
  $('#f1').onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    await withLoading(async () => {
      await post('/api/recuperar', corpo);
      $('#passo2').style.display = '';
      toast('Se o e-mail existir, o token foi gerado (visível no console do servidor).', 'ok');
    });
  };
  $('#f2').onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    await withLoading(async () => {
      await post('/api/recuperar/confirmar', corpo);
      toast('Senha redefinida! Faça login.', 'ok');
      location.hash = '#/login';
    });
  };
}

// ==================== DASHBOARD ====================
function calendarioDashboard(mes, compromissos) {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const inicio = new Date(ano, numeroMes - 1, 1);
  const primeiro = new Date(ano, numeroMes - 1, 1 - inicio.getDay());
  const totais = new Map();
  for (const item of compromissos) totais.set(item.data, (totais.get(item.data) || 0) + 1);
  return [...Array(42)].map((_, i) => {
    const data = new Date(primeiro); data.setDate(primeiro.getDate() + i);
    const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    const fora = data.getMonth() !== numeroMes - 1;
    const count = totais.get(iso) || 0;
    return `<button type="button" class="dash-day ${fora ? 'fora' : ''} ${iso === hojeISO() ? 'hoje' : ''} ${count ? 'com-agenda' : ''}" data-date="${iso}" aria-label="${fmtData(iso)}${count ? `, ${count} agendamentos` : ''}"><span>${data.getDate()}</span>${count ? `<i>${count}</i>` : ''}</button>`;
  }).join('');
}

function graficoFinanceiro(linhas) {
  const dados = linhas || [];
  const largura = 760, altura = 250, margem = { esquerda: 62, direita: 12, topo: 16, baixo: 38 };
  const w = largura - margem.esquerda - margem.direita;
  const h = altura - margem.topo - margem.baixo;
  const valores = dados.flatMap((x) => [x.receitas_centavos, x.despesas_centavos, x.saldo_centavos]);
  const minimo = Math.min(0, ...valores), maximo = Math.max(0, ...valores);
  const faixa = Math.max(maximo - minimo, 100);
  const x = (i) => margem.esquerda + (dados.length <= 1 ? w / 2 : i * w / (dados.length - 1));
  const y = (v) => margem.topo + ((maximo - v) / faixa) * h;
  const series = [
    ['receitas_centavos', '#00b66a'],
    ['despesas_centavos', '#df7c86'],
    ['saldo_centavos', '#6f79ca'],
  ];
  const linhasGrade = [0, 1, 2, 3, 4].map((i) => {
    const valor = maximo - (faixa * i / 4);
    const yy = margem.topo + h * i / 4;
    return `<line x1="${margem.esquerda}" y1="${yy}" x2="${largura - margem.direita}" y2="${yy}" stroke="#e7ebef"/><text x="${margem.esquerda - 8}" y="${yy + 4}" text-anchor="end" class="axis-label">${fmtBRL(valor / 100)}</text>`;
  }).join('');
  const caminhos = series.map(([chave, cor]) => {
    const pontos = dados.map((item, i) => `${x(i)},${y(item[chave] || 0)}`).join(' ');
    return `<polyline points="${pontos}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  const marcadores = dados.filter((_, i) => i % Math.max(1, Math.ceil(dados.length / 15)) === 0).map((item, i) => {
    const indice = dados.indexOf(item);
    return `<text x="${x(indice)}" y="${altura - 8}" text-anchor="middle" class="axis-label">${item.data.slice(8)}/${item.data.slice(5, 7)}</text>`;
  }).join('');
  return `<div class="flow-legend"><span><i class="receita"></i>Receitas</span><span><i class="despesa"></i>Despesas</span><span><i class="saldo"></i>Saldo</span></div><div class="flow-chart"><svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Fluxo de caixa por dia">${linhasGrade}${caminhos}${marcadores}</svg></div>`;
}

async function paginaDashboard(params = {}) {
  const solicitado = params.mes || '';
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(solicitado) ? solicitado : hojeISO().slice(0, 7);
  const d = await get(`/api/dashboard?mes=${mes}`);
  const r = d.resumo;
  const fin = d.financeiro;
  const valor = (centavos) => fmtBRL(Number(centavos || 0) / 100);
  const [ano, numeroMes] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, numeroMes, 0).getDate();
  const dataFinal = `${mes}-${String(ultimoDia).padStart(2, '0')}`;
  const mesTitulo = new Date(ano, numeroMes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const statusFinanceiro = { previsto: 'Previsto', nao_pago: 'Não pago', realizado: 'Realizado' };
  const pendentesHtml = fin ? (d.pendentes.length ? `<section class="dash-section">
          <div class="dash-section-title"><h2>Valores Pendentes</h2><span class="pendentes-total">Total pendente: <b>${valor(d.total_pendente_centavos)}</b></span></div>
          <div class="card">${d.pendentes.map((p) => `<div class="item-ag pendente-restante">
            <div class="ag-hora">${fmtData(p.data)}<br>${fmtHora(p.hora_inicio)}</div>
            <div class="ag-info">
              <div class="ag-cliente">${esc(p.cliente)}</div>
              <div class="ag-det">${esc(p.servico)} · Sinal pago: ${valor(p.valor_sinal_centavos)} · Restante: <b>${valor(p.pendente_centavos)}</b></div>
            </div>
            <button class="btn mini btn-primario" data-recebido="${p.id}" data-valor="${p.pendente_centavos}">Marcar recebido</button>
          </div>`).join('')}</div>
        </section>` : '') : '';
  const contasTabela = fin ? fin.contas.map((conta) => `<tr><td>${statusFinanceiro[conta.status]}</td><td class="valor-receber">${valor(conta.receber_centavos)}</td><td class="valor-pagar">${valor(conta.pagar_centavos)}</td><td class="valor-saldo">${valor(conta.saldo_centavos)}</td></tr>`).join('') : '';
  const saudacao = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  layout(`
    <div class="dashboard-title"><div><h1>${saudacao}, ${esc(state.user.nome)}!</h1><p>Resumo da sua clínica e da agenda.</p></div><span class="dashboard-date">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
    <div class="dashboard-layout">
      <section class="dashboard-main">
        <section class="dash-section">
          <h2>Acesso Rápido</h2>
          <div class="quick-actions">
            <button type="button" class="quick-card quick-teal" data-quick="appointment"><span class="quick-icon">▦</span><span>Novo<br>Agendamento</span></button>
            ${['admin', 'gestor', 'recepcao'].includes(state.user.perfil) ? `<button type="button" class="quick-card quick-pink" data-quick="client"><span class="quick-icon">♙</span><span>Novo Cliente</span></button>` : ''}
            ${fin ? `<button type="button" class="quick-card quick-teal" data-quick="sale"><span class="quick-icon">＋</span><span>Nova Venda</span></button><button type="button" class="quick-card quick-pink" data-quick="payable"><span class="quick-icon">$</span><span>Nova Conta a<br>Pagar</span></button>` : ''}
          </div>
        </section>
        ${pendentesHtml}
        ${fin ? `
        <section class="dash-section">
          <h2>Saúde Financeira</h2>
          <div class="health-grid">
            <a class="health-card health-receber" href="#/financeiro?tipo=receber"><span class="health-symbol">$</span><span class="health-value">${valor(fin.receber_hoje_centavos)}<small>a receber hoje</small></span><span class="health-open">Abrir</span></a>
            <a class="health-card health-pagar" href="#/financeiro?tipo=pagar"><span class="health-symbol">$</span><span class="health-value">${valor(fin.pagar_hoje_centavos)}<small>a pagar hoje</small></span><span class="health-open">Abrir</span></a>
            <a class="health-card health-receber pale" href="#/financeiro?tipo=receber&status=vencido"><span class="health-symbol">$</span><span class="health-value">${valor(fin.receber_vencido_centavos)}<small>recebimentos vencidos</small></span><span class="health-open">Abrir</span></a>
            <a class="health-card health-pagar pale" href="#/financeiro?tipo=pagar&status=vencido"><span class="health-symbol">$</span><span class="health-value">${valor(fin.pagar_vencido_centavos)}<small>pagamentos vencidos</small></span><span class="health-open">Abrir</span></a>
          </div>
        </section>
        <section class="dash-section">
          <div class="dash-section-title"><h2>Financeiro no período ${fmtData(`${mes}-01`)} a ${fmtData(dataFinal)}</h2><button type="button" class="icon-button" id="mes-anterior" aria-label="Mês anterior">‹</button><button type="button" class="icon-button" id="mes-proximo" aria-label="Próximo mês">›</button></div>
          <h3>Contas</h3>
          <div class="card finance-table-wrap"><table class="finance-summary"><thead><tr><th>Status</th><th>Contas a Receber (R$)</th><th>Contas a Pagar (R$)</th><th>Saldo (R$)</th></tr></thead><tbody>${contasTabela}</tbody></table></div>
        </section>
        <section class="dash-section">
          <div class="dash-section-title"><h2>Fluxo de Caixa</h2><select id="fluxo-tipo" class="flow-select" aria-label="Tipo de fluxo"><option value="realizado">Realizado</option><option value="previsto">Previsto</option></select></div>
          <div class="card cashflow-card" id="grafico-fluxo">${graficoFinanceiro(fin.fluxo.realizado)}</div>
        </section>` : `
        <section class="dash-section"><h2>Agenda de hoje</h2><div class="agenda-kpis"><div><b>${r.hoje_total}</b><span>agendamentos</span></div><div><b>${r.hoje_confirmados}</b><span>confirmados</span></div><div><b>${r.hoje_clientes}</b><span>atendidos</span></div></div>
          <div class="card">${d.agendamentos_hoje.length ? d.agendamentos_hoje.map(itemAgendaCompacto).join('') : '<div class="vazio">Nenhum agendamento para hoje.</div>'}</div>
        </section>`}
        <section class="dash-section next-appointments"><h2>Próximos atendimentos</h2><div class="card">${d.proximos.length ? d.proximos.map((a) => `<a class="next-appointment" href="#/agenda?data=${a.data}"><b>${fmtData(a.data)} ${fmtHora(a.hora_inicio)}</b><span>${esc(a.cliente)} · ${esc(a.servico)}</span></a>`).join('') : '<div class="vazio">Nada agendado ainda.</div>'}</div></section>
      </section>
      <aside class="dashboard-aside">
        <section class="dash-section"><h2>Agenda</h2><div class="card mini-calendar-card"><div class="calendar-nav"><button id="cal-anterior" type="button" aria-label="Mês anterior">‹</button><span>${mesTitulo}</span><button id="cal-proximo" type="button" aria-label="Próximo mês">›</button></div><div class="mini-calendar-grid">${DOW.map((dia) => `<b>${dia}</b>`).join('')}${calendarioDashboard(mes, d.agendamentos_mes)}</div></div></section>
        <section class="dash-section"><h2>Aniversariantes</h2><div class="birthday-card">${d.aniversariantes.length ? d.aniversariantes.map((p) => `<div class="birthday-row"><span class="birthday-avatar">${esc(p.nome.slice(0, 1).toUpperCase())}</span><span><b>${esc(p.nome)}</b><small>${p.dias === 0 ? 'Hoje' : `em ${p.dias} dias`} · ${fmtData(p.data_nascimento)}</small></span></div>`).join('') : '<p>Nenhum aniversariante nos próximos 7 dias.</p>'}</div></section>
      </aside>
    </div>
  `, 'dashboard');

  $$('[data-quick]').forEach((botao) => botao.onclick = () => {
    if (botao.dataset.quick === 'appointment') location.hash = '#/agenda?novo=1';
    if (botao.dataset.quick === 'client') modalCliente(null);
    if (botao.dataset.quick === 'sale') modalLancamento('receber');
    if (botao.dataset.quick === 'payable') modalLancamento('pagar');
  });
  const navegarMes = (delta) => {
    const data = new Date(ano, numeroMes - 1 + delta, 1);
    const novoMes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
    location.hash = `#/dashboard?mes=${novoMes}`;
  };
  $('#cal-anterior').onclick = () => navegarMes(-1);
  if (fin) $('#mes-anterior').onclick = () => navegarMes(-1);
  $('#cal-proximo').onclick = () => navegarMes(1);
  if (fin) $('#mes-proximo').onclick = () => navegarMes(1);
  $$('.dash-day').forEach((botao) => botao.onclick = () => { location.hash = `#/agenda?data=${botao.dataset.date}`; });
  $$('[data-recebido]').forEach((botao) => botao.onclick = async () => {
    const id = botao.dataset.recebido;
    if (!confirm(`Confirmar recebimento do restante de ${valor(Number(botao.dataset.valor))}?`)) return;
    botao.disabled = true;
    try {
      await post(`/api/dashboard/pendentes/${id}/recebido`, {});
      paginaDashboard({ mes });
    } catch (e) {
      botao.disabled = false;
      alert(e.message || 'Erro ao registrar recebimento');
    }
  });
  if (fin) $('#fluxo-tipo').onchange = (e) => { $('#grafico-fluxo').innerHTML = graficoFinanceiro(fin.fluxo[e.target.value]); };
}
function itemAgendaCompacto(a) {
  return `<div class="item-ag ${STATUS_CLS[a.status]}">
    <div class="ag-hora">${fmtHora(a.hora_inicio)}</div>
    <div class="ag-info">
      <div class="ag-cliente">${esc(a.cliente)} ${tagStatus(a.status)}</div>
      <div class="ag-det">${esc(a.servico)} · ${esc(a.profissional)}${a.sala ? ' · ' + esc(a.sala) : ''}</div>
    </div>
    <a class="btn mini btn-sec" href="#/agenda?data=${a.data}">Abrir</a>
 </div>`;
}

// ==================== AGENDA ====================
async function paginaAgenda(params) {
  const [profs, salas, servs] = await Promise.all([
    get('/api/profissionais'), get('/api/salas'), get('/api/servicos?ativos=1'),
  ]);
  const vista = params.vista || 'dia';
  const data = params.data || hojeISO();

  layout(`
    <div class="topo"><h1>Agenda</h1>
      <div class="acoes">
        <button class="btn btn-primario" id="btn-novo">+ Novo agendamento</button>
        <a class="btn btn-sec" href="#/bloqueios">Bloquear agenda</a>
      </div>
    </div>
    <div class="abas">
      <button data-v="dia" class="${vista === 'dia' ? 'ativo' : ''}">Dia</button>
      <button data-v="semana" class="${vista === 'semana' ? 'ativo' : ''}">Semana</button>
      <button data-v="mes" class="${vista === 'mes' ? 'ativo' : ''}">Mês</button>
    </div>
    <div class="barra-filtros card">
      <div><label>Data</label><input type="date" id="f-data" value="${data}"></div>
      <div><label>Profissional</label><select id="f-prof"><option value="">Todos</option>
        ${profs.filter(p => p.ativo).map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>
      <div><label>Sala</label><select id="f-sala"><option value="">Todas</option>
        ${salas.filter(s => s.ativa).map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select></div>
      <div><label>Serviço</label><select id="f-serv"><option value="">Todos</option>
        ${servs.map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select></div>
      <div><button class="btn btn-sec" id="f-limpar">Limpar filtros</button></div>
    </div>
    <div id="agenda-corpo">Carregando…</div>
  `, 'agenda');

  const filtros = { profissional_id: params.profissional_id || '', sala_id: params.sala_id || '', servico_id: params.servico_id || '' };
  $('#f-prof').value = filtros.profissional_id;
  $('#f-sala').value = filtros.sala_id;
  $('#f-serv').value = filtros.servico_id;

  const navegar = (delta) => {
    const base = new Date(data + 'T12:00:00');
    if (vista === 'dia') base.setDate(base.getDate() + delta);
    else if (vista === 'semana') base.setDate(base.getDate() + delta * 7);
    else base.setMonth(base.getMonth() + delta);
    const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    location.hash = `#/agenda?vista=${vista}&data=${iso}`;
  };

  $('#f-data').onchange = (e) => { location.hash = `#/agenda?vista=${vista}&data=${e.target.value}`; };
  $('#f-prof').onchange = $('#f-sala').onchange = $('#f-serv').onchange = () => aplicarFiltros();
  $('#f-limpar').onclick = () => { location.hash = `#/agenda?vista=${vista}&data=${data}`; };
  $('#btn-novo').onclick = () => modalAgendamento({ data, profissional_id: filtros.profissional_id || '' });
  $$('.abas button').forEach((b) => b.onclick = () => {
    location.hash = `#/agenda?vista=${b.dataset.v}&data=${data}`;
  });
  window.__agendaNav = navegar;

  function qsFiltros() {
    const p = new URLSearchParams({ de: data, ate: data });
    if (filtros.profissional_id) p.set('profissional_id', filtros.profissional_id);
    if (filtros.sala_id) p.set('sala_id', filtros.sala_id);
    if (filtros.servico_id) p.set('servico_id', filtros.servico_id);
    return p;
  }
  function aplicarFiltros() {
    filtros.profissional_id = $('#f-prof').value;
    filtros.sala_id = $('#f-sala').value;
    filtros.servico_id = $('#f-serv').value;
    carregar();
  }

  async function carregar() {
    if (vista === 'dia') {
      const lista = await get('/api/agendamentos?' + qsFiltros());
      $('#agenda-corpo').innerHTML = `
        <div class="card">
          <div class="nav-data">
            <button class="btn mini btn-sec" onclick="window.__agendaNav(-1)">←</button>
            <b>${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</b>
            <button class="btn mini btn-sec" onclick="window.__agendaNav(1)">→</button>
          </div>
          ${lista.length ? `<div class="agenda-dia">${lista.map(itemAgenda).join('')}</div>` : '<div class="vazio">Sem agendamentos nesta data.</div>'}
        </div>`;
      bindAcoesAgenda();
    } else if (vista === 'semana') {
      const ini = new Date(data + 'T12:00:00'); ini.setDate(ini.getDate() - ini.getDay());
      const dias = [...Array(7)].map((_, i) => {
        const d = new Date(ini); d.setDate(d.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });
      const lista = await get(`/api/agendamentos?de=${dias[0]}&ate=${dias[6]}`);
      const horas = []; for (let h = 7; h <= 21; h++) horas.push(`${String(h).padStart(2, '0')}:00`);
      const cel = {};
      for (const a of lista) {
        if (filtros.profissional_id && String(a.profissional_id) !== filtros.profissional_id) continue;
        if (filtros.sala_id && String(a.sala_id || '') !== filtros.sala_id) continue;
        if (filtros.servico_id && String(a.servico_id) !== filtros.servico_id) continue;
        (cel[`${a.data}|${a.hora_inicio.slice(0, 2)}:00`] ||= []).push(a);
      }
      $('#agenda-corpo').innerHTML = `
        <div class="card">
          <div class="nav-data">
            <button class="btn mini btn-sec" onclick="window.__agendaNav(-1)">←</button>
            <b>${fmtData(dias[0])} – ${fmtData(dias[6])}</b>
            <button class="btn mini btn-sec" onclick="window.__agendaNav(1)">→</button>
          </div>
          <div class="tabela-responsiva"><div class="semana">
            <div class="cel cab"></div>
            ${dias.map((d, i) => `<div class="cel cab">${DOW[i]} ${d.slice(8)}</div>`).join('')}
            ${horas.map((h) => `
              <div class="cel hora-cab">${h}</div>
              ${dias.map((d) => `<div class="cel" data-d="${d}" data-h="${h}">
                ${(cel[`${d}|${h}`] || []).map((a) => `
                  <div class="ev ${STATUS_CLS[a.status]}" data-id="${a.id}" data-data="${a.data}">
                    ${fmtHora(a.hora_inicio)} ${esc(a.cliente)}</div>`).join('')}
              </div>`).join('')}
            `).join('')}
          </div></div>
        </div>`;
      $$('#agenda-corpo .ev').forEach((el) => el.onclick = () => modalAgendamento({ id: Number(el.dataset.id) }));
    } else {
      // mês
      const [y, m] = data.split('-').map(Number);
      const primeiro = new Date(y, m - 1, 1);
      const iniCal = new Date(primeiro); iniCal.setDate(iniCal.getDate() - iniCal.getDay());
      const fimMes = new Date(y, m, 0);
      const ultimo = new Date(fimMes); ultimo.setDate(ultimo.getDate() + (6 - ultimo.getDay()));
      const lista = await get(`/api/agendamentos?de=${fmtISO(iniCal)}&ate=${fmtISO(ultimo)}`);
      const porDia = {};
      for (const a of lista) {
        if (filtros.profissional_id && String(a.profissional_id) !== filtros.profissional_id) continue;
        if (filtros.sala_id && String(a.sala_id || '') !== filtros.sala_id) continue;
        if (filtros.servico_id && String(a.servico_id) !== filtros.servico_id) continue;
        (porDia[a.data] ||= []).push(a);
      }
      const celulas = [];
      for (let d = new Date(iniCal); d <= ultimo; d.setDate(d.getDate() + 1)) {
        const iso = fmtISO(d);
        celulas.push(`
          <div class="cal-cel ${d.getMonth() + 1 !== m ? 'fora' : ''} ${iso === hojeISO() ? 'hoje' : ''}"
               data-data="${iso}">
            <div class="num">${d.getDate()}</div>
            ${(porDia[iso] || []).slice(0, 3).map((a) => `<div class="ev">${fmtHora(a.hora_inicio)} ${esc(a.cliente)}</div>`).join('')}
            ${(porDia[iso] || []).length > 3 ? `<div class="ev">+${porDia[iso].length - 3}</div>` : ''}
          </div>`);
      }
      $('#agenda-corpo').innerHTML = `
        <div class="card">
          <div class="nav-data">
            <button class="btn mini btn-sec" onclick="window.__agendaNav(-1)">←</button>
            <b>${primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>
            <button class="btn mini btn-sec" onclick="window.__agendaNav(1)">→</button>
          </div>
          <div class="cal-mensal">
            ${DOW.map((d) => `<div class="cab">${d}</div>`).join('')}
            ${celulas.join('')}
          </div>
        </div>`;
      $$('#agenda-corpo .cal-cel').forEach((el) => el.onclick = () => {
        location.hash = `#/agenda?vista=dia&data=${el.dataset.data}`;
      });
    }
  }

  if (params.novo) modalAgendamento({ data, profissional_id: filtros.profissional_id || '' });
  await withLoading(carregar);
}

function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function itemAgenda(a) {
  const podeEditar = !['finalizado', 'falta'].includes(a.status);
  return `<div class="item-ag ${STATUS_CLS[a.status]}">
    <div class="ag-hora">${fmtHora(a.hora_inicio)}<div class="ag-fim">${fmtHora(a.hora_fim)}</div></div>
    <div class="ag-info">
      <div class="ag-cliente">${esc(a.cliente)} ${tagStatus(a.status)}</div>
      <div class="ag-det">${esc(a.servico)} · ${esc(a.profissional)}${a.sala ? ' · ' + esc(a.sala) : ''}${a.cliente_telefone ? ' · ' + esc(a.cliente_telefone) : ''}</div>
      ${a.observacoes ? `<div class="ag-det">📝 ${esc(a.observacoes)}</div>` : ''}
    </div>
    <div class="ag-acoes">
      ${a.status === 'pendente' ? `<button class="btn mini btn-ok" data-acao="confirmado" data-id="${a.id}">Confirmar</button>` : ''}
      ${a.status === 'confirmado' ? `<button class="btn mini btn-primario" data-acao="em_atendimento" data-id="${a.id}">Iniciar atendimento</button>
                                     <button class="btn mini btn-sec" data-acao="falta" data-id="${a.id}">Falta</button>` : ''}
      
      ${a.status === 'em_atendimento' ? `<button class="btn mini btn-ok" data-acao="finalizado" data-id="${a.id}">Finalizar</button><button class="btn mini btn-sec" data-acao="falta" data-id="${a.id}">Falta</button>` : ''}
      ${['pendente', 'confirmado'].includes(a.status) ? `<button class="btn mini btn-sec" data-acao="cancelado" data-id="${a.id}">Cancelar</button>` : ''}
      ${a.status === 'cancelado' ? `<button class="btn mini btn-sec" data-acao="pendente" data-id="${a.id}">Reativar</button>` : ''}
      ${podeEditar ? `<button class="btn mini btn-sec" data-editar="${a.id}">Editar</button>` : ''}
      <button class="btn mini btn-perigo" data-excluir="${a.id}">Excluir</button>
    </div>
 </div>`;
}

function bindAcoesAgenda() {
  $$('#agenda-corpo [data-acao]').forEach((b) => b.onclick = async () => {
    const acao = b.dataset.acao;
    await withLoading(async () => {
      await post(`/api/agendamentos/${b.dataset.id}/status`, { status: acao });
      toast(acao === 'cancelado' ? 'Agendamento cancelado' : 'Status atualizado', 'ok');
      location.reload();
    });
  });
  $$('#agenda-corpo [data-editar]').forEach((b) => b.onclick = () => modalAgendamento({ id: Number(b.dataset.editar) }));
  $$('#agenda-corpo [data-excluir]').forEach((b) => b.onclick = async () => {
    if (!confirmar('Excluir este agendamento? Esta ação não pode ser desfeita.')) return;
    await withLoading(async () => {
      await del(`/api/agendamentos/${b.dataset.excluir}`);
      toast('Agendamento excluído', 'ok');
      location.reload();
    });
  });
}
// ==================== MODAL AGENDAMENTO ====================
async function modalAgendamento({ id = null, data = hojeISO(), profissional_id = '' } = {}) {
  const [clientes, profs, servs, salas] = await Promise.all([
    get('/api/clientes'), get('/api/profissionais'), get('/api/servicos?ativos=1'), get('/api/salas'),
  ]);
  let ag = null;
  if (id) ag = await get(`/api/agendamentos/${id}`);

  const servicosAtivos = servs.filter((s) => s.ativo);
  const profsAtivos = profs.filter((p) => p.ativo);
  const statusOpcoes = !id
    ? [['pendente', STATUS.pendente]]
    : state.user?.perfil === 'admin'
      ? Object.entries(STATUS)
      : [...new Set([ag.status, ...(TRANSICOES_STATUS[ag.status] || [])])].map((s) => [s, STATUS[s]]);
  const campoStatus = id
    ? '<select name="status">' + statusOpcoes.map(([k, v]) =>
      '<option value="' + k + '" ' + (ag.status === k ? 'selected' : '') + '>' + esc(v) + '</option>'
    ).join('') + '</select>'
    : '<input type="text" value="' + esc(STATUS.pendente) + '" disabled>';

  const m = UI.modal(`
    <h2>${id ? 'Editar agendamento' : 'Novo agendamento'}</h2>
    <form id="form-ag">
      <label>Cliente *</label>
      <select name="cliente_id" required>
        <option value="">— selecionar —</option>
        ${clientes.map((c) => `<option value="${c.id}" ${ag?.cliente_id === c.id ? 'selected' : ''}>${esc(c.nome)}${c.telefone ? ' · ' + esc(c.telefone) : ''}</option>`).join('')}
      </select>
      <div class="linha" id="novo-cliente" style="display:none">
        <label>Nome do novo cliente<input name="novo_nome"></label>
        <label>Telefone<input name="novo_telefone" placeholder="(00) 00000-0000"></label>
      </div>
      <label><input type="checkbox" id="chk-novo-cliente" ${clientes.length ? '' : 'checked'}> Cadastrar novo cliente</label>

      <div class="linha">
        <div><label>Serviço *</label>
          <select name="servico_id" id="sel-servico" required>
            <option value="">— selecionar —</option>
            ${servicosAtivos.map((s) => `<option value="${s.id}" data-dur="${s.duracao_min}" ${ag?.servico_id === s.id ? 'selected' : ''}>${esc(s.nome)} (${fmtDuracao(s.duracao_min)})</option>`).join('')}
          </select></div>
        <div><label>Profissional *</label>
          <select name="profissional_id" id="sel-prof" required>
            <option value="">— selecionar —</option>
            ${profsAtivos.map((p) => `<option value="${p.id}" ${(ag?.profissional_id || profissional_id) == p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
          </select></div>
      </div>
      <div class="linha">
        <div><label>Data *</label><input type="date" name="data" required value="${ag?.data || data}"></div>
        <div><label>Hora início *</label><select name="hora_inicio" id="sel-hora" required>
          <option value="">— escolha a data/profissional —</option></select></div>
      </div>
      <div class="linha">
        <div><label>Sala</label><select name="sala_id"><option value="">—</option>
          ${salas.filter((s) => s.ativa).map((s) => `<option value="${s.id}" ${ag?.sala_id === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
        </select></div>
        <div><label>Status</label>
          ${campoStatus}</div>
      </div>
      <div id="clube-info" class="clube-info"></div>
      <label>Observações<textarea name="observacoes" rows="2">${esc(ag?.observacoes || '')}</textarea></label>
      <div id="ag-erro" class="campo-erro"></div>
      <div class="modal-rodape">
        <button type="button" class="btn btn-sec" id="m-cancelar">Cancelar</button>
        <button class="btn btn-primario">${id ? 'Salvar' : 'Agendar'}</button>
      </div>
    </form>`);

  $('#m-cancelar', m).onclick = () => m.remove();
  const chk = $('#chk-novo-cliente', m);
  chk.onchange = () => { $('#novo-cliente', m).style.display = chk.checked ? '' : 'none'; };
  if (chk.checked) $('#novo-cliente', m).style.display = '';

  // carrega slots quando data/prof/serviço mudam
  const selServ = $('#sel-servico', m), selProf = $('#sel-prof', m), selHora = $('#sel-hora', m);
  const dataInput = $('input[name=data]', m);
  async function carregarSlots() {
    if (!selServ.value || !selProf.value || !dataInput.value) return;
    selHora.innerHTML = '<option value="">carregando…</option>';
    try {
      const r = await get(`/api/disponibilidade?profissional_id=${selProf.value}&servico_id=${selServ.value}&data=${dataInput.value}`);
      if (!r.slots.length) {
        selHora.innerHTML = `<option value="">Sem horários livres nesta data</option>`;
        return;
      }
      selHora.innerHTML = r.slots.map((h) => `<option value="${h}" ${ag?.hora_inicio === h ? 'selected' : ''}>${h}</option>`).join('');
      if (ag?.data === dataInput.value && ag?.hora_inicio && !r.slots.includes(ag.hora_inicio.slice(0, 5))) {
        selHora.insertAdjacentHTML('afterbegin', `<option value="${fmtHora(ag.hora_inicio)}" selected>${fmtHora(ag.hora_inicio)} (atual)</option>`);
      }
    } catch (e) {
      selHora.innerHTML = `<option value="">${esc(e.message)}</option>`;
    }
  }
  selServ.onchange = selProf.onchange = dataInput.onchange = carregarSlots;
  if (selServ.value && selProf.value) carregarSlots();

  // Clube de assinaturas: verifica elegibilidade do cliente no serviço escolhido.
  const clubeInfo = $('#clube-info', m);
  const selCliente = $('select[name=cliente_id]', m);
  async function atualizarClube() {
    if (!selCliente.value || !selServ.value) { clubeInfo.innerHTML = ''; return; }
    clubeInfo.innerHTML = '<small>verificando benefícios…</small>';
    try {
      const b = await get(`/api/agendamentos/beneficio?cliente_id=${selCliente.value}&servico_id=${selServ.value}`);
      if (b.tipo === 'incluido') {
        clubeInfo.innerHTML = `<span class="clube-tag ok">★ ${esc(b.assinatura.plano)}</span> Benefício incluído no plano — <b>${b.restantes}</b> uso(s) restante(s) no ciclo.`;
      } else if (b.tipo === 'desconto') {
        clubeInfo.innerHTML = `<span class="clube-tag ok">★ ${esc(b.assinatura.plano)}</span> Desconto de assinante (${b.pct}%): <s>${centavos(b.preco_original_centavos)}</s> <b>${centavos(b.preco_final_centavos)}</b>`;
      } else if (b.tipo === 'sem_beneficio') {
        clubeInfo.innerHTML = `<span class="clube-tag">★ ${esc(b.assinatura.plano)}</span> Sem benefício/quantidade para este serviço neste ciclo — valor avulso ${centavos(b.servico?.preco_centavos)}.`;
      } else {
        clubeInfo.innerHTML = '';
      }
    } catch { clubeInfo.innerHTML = ''; }
  }
  selCliente.onchange = atualizarClube;
  selServ.addEventListener('change', atualizarClube);
  if (selCliente.value && selServ.value) atualizarClube();

  $('#form-ag', m).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const corpo = Object.fromEntries(f.entries());
    $('#ag-erro', m).textContent = '';
    loading(true);
    try {
      if (chk.checked) {
        if (!corpo.novo_nome?.trim()) throw new Error('Informe o nome do novo cliente');
        const nc = await post('/api/clientes', { nome: corpo.novo_nome.trim(), telefone: corpo.novo_telefone });
        corpo.cliente_id = nc.id;
      }
      if (!corpo.cliente_id) throw new Error('Selecione ou cadastre um cliente');
      delete corpo.novo_nome; delete corpo.novo_telefone;
      if (id) { await put('/api/agendamentos/' + id, corpo); toast('Agendamento atualizado', 'ok'); }
      else { await post('/api/agendamentos', corpo); toast('Agendamento criado', 'ok'); }
      m.remove();
      location.reload();
    } catch (e2) {
      $('#ag-erro', m).textContent = e2.message || 'Não foi possível salvar o agendamento.';
    } finally {
      loading(false);
    }
  };
}

async function paginaFinanceiro(params = {}) {
  const tipo = ['receber', 'pagar'].includes(params.tipo) ? params.tipo : 'receber';
  const statusFiltro = params.status && ['previsto', 'nao_pago', 'realizado', 'cancelado', 'vencido'].includes(params.status) ? params.status : '';
  const consulta = new URLSearchParams({ tipo });
  if (statusFiltro) consulta.set('status', statusFiltro);
  const [lista, clientes] = await Promise.all([get('/api/financeiro?' + consulta), get('/api/clientes')]);
  const nomeTipo = tipo === 'receber' ? 'Contas a Receber' : 'Contas a Pagar';
  const descricaoStatus = { previsto: 'Previsto', nao_pago: 'Não pago', realizado: 'Realizado', cancelado: 'Cancelado' };
  const hoje = hojeISO();
  layout(`
    <div class="topo"><div><h1>${nomeTipo}</h1><p class="texto-fraco">Acompanhe vencimentos e pagamentos da clínica.</p></div><div class="acoes"><button id="btn-novo-lancamento" class="btn btn-primario">+ Novo lançamento</button></div></div>
    <div class="abas finance-tabs"><a class="${tipo === 'receber' ? 'ativo' : ''}" href="#/financeiro?tipo=receber">A receber</a><a class="${tipo === 'pagar' ? 'ativo' : ''}" href="#/financeiro?tipo=pagar">A pagar</a></div>
    <div class="card"><div class="tabela-responsiva"><table class="finance-list"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Cliente</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
      ${lista.length ? lista.map((item) => {
        const vencido = item.status !== 'realizado' && item.status !== 'cancelado' && item.vencimento < hoje;
        return `<tr><td>${fmtData(item.vencimento)}</td><td><b>${esc(item.descricao)}</b>${item.categoria ? `<small>${esc(item.categoria)}</small>` : ''}</td><td>${esc(item.cliente || '—')}</td><td><span class="finance-tag ${vencido ? 'vencido' : item.status}">${vencido ? 'Vencido' : descricaoStatus[item.status]}</span></td><td class="${tipo === 'receber' ? 'valor-receber' : 'valor-pagar'}">${fmtBRL(item.valor_centavos / 100)}</td><td class="finance-actions"><button class="btn mini btn-sec" data-fin-editar="${item.id}">Editar</button>${!['realizado', 'cancelado'].includes(item.status) ? `<button class="btn mini btn-ok" data-fin-status="${item.id}">${tipo === 'receber' ? 'Recebido' : 'Pago'}</button>` : ''}<button class="btn mini btn-perigo" data-fin-excluir="${item.id}">Excluir</button></td></tr>`;
      }).join('') : '<tr><td colspan="6" class="vazio">Nenhum lançamento neste filtro.</td></tr>'}
    </tbody></table></div></div>
  `, 'financeiro');
  $('#btn-novo-lancamento').onclick = () => modalLancamento(tipo);
  $$('[data-fin-editar]').forEach((b) => b.onclick = () => modalLancamento(tipo, lista.find((x) => x.id == b.dataset.finEditar)));
  $$('[data-fin-status]').forEach((b) => b.onclick = async () => {
    await withLoading(async () => { await post(`/api/financeiro/${b.dataset.finStatus}/status`, { status: 'realizado' }); location.reload(); });
  });
  $$('[data-fin-excluir]').forEach((b) => b.onclick = async () => {
    if (!confirmar('Excluir este lançamento financeiro?')) return;
    await withLoading(async () => { await del(`/api/financeiro/${b.dataset.finExcluir}`); location.reload(); });
  });
}

async function modalLancamento(tipo, item = null) {
  const clientes = tipo === 'receber' ? await get('/api/clientes') : [];
  const m = UI.modal(`
    <h2>${item ? 'Editar lançamento' : tipo === 'receber' ? 'Nova venda / conta a receber' : 'Nova conta a pagar'}</h2>
    <form id="form-financeiro">
      <input type="hidden" name="tipo" value="${tipo}">
      <label>Descrição *<input name="descricao" required maxlength="160" value="${esc(item?.descricao || '')}" placeholder="Ex.: Venda de produto"></label>
      <div class="linha"><div><label>Valor (R$) *<input type="number" name="valor" min="0.01" step="0.01" required value="${item ? (item.valor_centavos / 100).toFixed(2) : ''}"></label></div><div><label>Vencimento *<input type="date" name="vencimento" required value="${item?.vencimento || hojeISO()}"></label></div></div>
      ${tipo === 'receber' ? `<label>Cliente<select name="cliente_id"><option value="">Sem cliente vinculado</option>${clientes.map((c) => `<option value="${c.id}" ${item?.cliente_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>` : ''}
      <div class="linha"><div><label>Categoria<input name="categoria" value="${esc(item?.categoria || (tipo === 'receber' ? 'Venda' : 'Despesa'))}"></label></div><div><label>Status<select name="status">${[['previsto', 'Previsto'], ['nao_pago', 'Não pago'], ['realizado', 'Realizado'], ['cancelado', 'Cancelado']].map(([v, n]) => `<option value="${v}" ${(item?.status || 'previsto') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div></div>
      <label>Observações<textarea name="observacoes" rows="2">${esc(item?.observacoes || '')}</textarea></label>
      <div class="modal-rodape"><button type="button" class="btn btn-sec" id="fin-cancelar">Cancelar</button><button class="btn btn-primario">Salvar</button></div>
    </form>`);
  $('#fin-cancelar', m).onclick = () => m.remove();
  $('#form-financeiro', m).onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    if (!corpo.cliente_id) delete corpo.cliente_id;
    await withLoading(async () => {
      if (item) await put(`/api/financeiro/${item.id}`, corpo);
      else await post('/api/financeiro', corpo);
      m.remove();
      toast('Lançamento salvo', 'ok');
      if (state.rota === 'financeiro') location.reload();
    });
  };
}
function telParaWhats(tel){ if(!tel) return null; var n=String(tel).replace(/\D/g,""); if(n.length===11&&n[0]!=="5")n="55"+n; else if(n.length===10&&n[0]!=="5")n="55"+n; return n; }
function linkWhats(tel){ var n=telParaWhats(tel); if(!n) return esc(tel); return "<a href=\"https://wa.me/"+n+"\" target=\"_blank\" rel=\"noopener\" class=\"tel-whats\" title=\"Abrir conversa no WhatsApp\">"+esc(tel)+" \uD83D\uDCAC</a>"; }
// ==================== CLIENTES ====================
async function paginaClientes(params = {}) {
  layout(`
    <div class="topo"><h1>Clientes</h1>
      <div class="acoes">
        <input id="busca-cli" placeholder="Buscar por nome, telefone ou e-mail…" style="min-width:260px">
        <button class="btn btn-primario" id="btn-novo-cli">+ Novo cliente</button>
      </div>
    </div>
    <div class="card"><div class="tabela-responsiva" id="tab-cli">Carregando…</div></div>
  `, 'clientes');

  async function carregar(busca = '') {
    const lista = await get('/api/clientes' + (busca ? `?busca=${encodeURIComponent(busca)}` : ''));
    $('#tab-cli').innerHTML = lista.length ? `
      <table><thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Agend.</th><th></th></tr></thead><tbody>
      ${lista.map((c) => `
        <tr>
          <td><b>${esc(c.nome)}</b>${c.observacoes ? `<div class="texto-fraco">${esc(c.observacoes)}</div>` : ''}</td>
          <td>${c.telefone ? linkWhats(c.telefone) : '\u2014'}</td><td>${esc(c.email || '—')}</td>
          <td>${c.total_agendamentos}${c.total_agendamentos >= 3 ? ' ⭐' : ''}</td>
          <td class="cel-acoes">
            <button class="btn mini btn-sec" data-hist="${c.id}">Histórico</button>
            <button class="btn mini btn-sec" data-editar="${c.id}">Editar</button>
            <button class="btn mini btn-perigo" data-excluir="${c.id}">Inativar</button>
          </td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="vazio">Nenhum cliente encontrado.</div>';

    $$('#tab-cli [data-hist]').forEach((b) => b.onclick = async () => {
      const c = await get(`/api/clientes/${b.dataset.hist}`);
      UI.modal(`
        <h2>${esc(c.nome)}</h2>
        <p class="texto-fraco">${esc(c.telefone || '')} ${c.email ? '· ' + esc(c.email) : ''} ${c.data_nascimento ? '· nasceu ' + fmtData(c.data_nascimento) : ''}</p>
        ${c.observacoes ? `<p>📝 ${esc(c.observacoes)}</p>` : ''}
        <h3>Histórico</h3>
        ${c.agendamentos.length ? `<div class="tabela-responsiva"><table>
          <thead><tr><th>Data</th><th>Serviço</th><th>Profissional</th><th>Status</th></tr></thead>
          <tbody>${c.agendamentos.map((a) => `
            <tr><td>${fmtData(a.data)} ${fmtHora(a.hora_inicio)}</td><td>${esc(a.servico)}</td>
            <td>${esc(a.profissional)}</td><td>${tagStatus(a.status)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="vazio">Sem agendamentos.</div>'}
      `);
    });
    $$('#tab-cli [data-editar]').forEach((b) => b.onclick = () => modalCliente(lista.find((x) => x.id == b.dataset.editar)));
    $$('#tab-cli [data-excluir]').forEach((b) => b.onclick = async () => {
      if (!confirmar('Inativar este cliente? O histórico será mantido.')) return;
      await withLoading(async () => { await del(`/api/clientes/${b.dataset.excluir}`); toast('Cliente inativado', 'ok'); carregar(busca); });
    });
  }

  let timer;
  $('#busca-cli').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => carregar(e.target.value.trim()), 300); };
  $('#btn-novo-cli').onclick = () => modalCliente(null, () => carregar($('#busca-cli').value.trim()));
  await withLoading(() => carregar(params.busca || ""));
}

function modalCliente(cli, aoSalvar) {
  const m = UI.modal(`
    <h2>${cli ? 'Editar cliente' : 'Novo cliente'}</h2>
    <form id="form-cli">
      <label>Nome *<input name="nome" required value="${esc(cli?.nome || '')}"></label>
      <div class="linha">
        <div><label>Telefone<input name="telefone" value="${esc(cli?.telefone || '')}"></label></div>
        <div><label>Nascimento<input type="date" name="data_nascimento" value="${cli?.data_nascimento || ''}"></label></div>
      </div>
      <label>E-mail<input type="email" name="email" value="${esc(cli?.email || '')}"></label>
      <label>Observações<textarea name="observacoes" rows="2">${esc(cli?.observacoes || '')}</textarea></label>
      <div id="cli-erro" class="campo-erro"></div>
      <div class="modal-rodape">
        <button type="button" class="btn btn-sec" id="c-cancel">Cancelar</button>
        <button class="btn btn-primario">Salvar</button>
      </div>
    </form>`);
  $('#c-cancel', m).onclick = () => m.remove();
  $('#form-cli', m).onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    try {
      await withLoading(async () => {
        if (cli) await put(`/api/clientes/${cli.id}`, corpo);
        else await post('/api/clientes', corpo);
        toast('Cliente salvo', 'ok');
        m.remove();
        aoSalvar?.();
      });
    } catch (e2) { $('#cli-erro', m).textContent = e2.message; }
  };
}

// ==================== PROFISSIONAIS ====================
async function paginaProfissionais() {
  const [profs, servs] = await Promise.all([get('/api/profissionais'), get('/api/servicos')]);
  layout(`
    <div class="topo"><h1>Profissionais</h1>
      <div class="acoes"><button class="btn btn-primario" id="btn-novo">+ Novo profissional</button></div>
    </div>
    <div class="card"><div class="tabela-responsiva" id="tab">Carregando…</div></div>
  `, 'profissionais');

  $('#tab').innerHTML = profs.length ? `
    <table><thead><tr><th>Nome</th><th>Especialidade</th><th>Serviços</th><th>Horários</th><th>Status</th><th></th></tr></thead><tbody>
    ${profs.map((p) => `
      <tr>
        <td><b>${esc(p.nome)}</b><div class="texto-fraco">${esc(p.telefone || '')}</div></td>
        <td>${esc(p.especialidade || '—')}</td>
        <td>${p.servicos.map((s) => esc(s.nome)).join(', ') || '—'}</td>
        <td>${resumoHorarios(p)}</td>
        <td>${p.ativo ? '<span class="tag st-confirmado">Ativo</span>' : '<span class="tag st-cancelado">Inativo</span>'}</td>
        <td class="cel-acoes">
          <button class="btn mini btn-sec" data-editar="${p.id}">Editar</button>
        </td>
      </tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum profissional cadastrado.</div>';

  function resumoHorarios(p) {
    const dias = [[1, 'seg'], [2, 'ter'], [3, 'qua'], [4, 'qui'], [5, 'sex'], [6, 'sáb'], [0, 'dom']];
    return dias.filter(([n]) => p.horarios.some((h) => h.dia_semana === n))
      .map(([, s]) => s).join(', ') || '—';
  }

  $$('#tab [data-editar]').forEach((b) => b.onclick = () => modalProfissional(profs.find((x) => x.id == b.dataset.editar), servs));
  $('#btn-novo').onclick = () => modalProfissional(null, servs);
}

function modalProfissional(prof, servicos) {
  const servIds = new Set((prof?.servicos || []).map((s) => s.id));
  const horarios = prof?.horarios || [];
  const m = UI.modal(`
    <h2>${prof ? 'Editar profissional' : 'Novo profissional'}</h2>
    <form id="form-prof">
      <label>Nome *<input name="nome" required value="${esc(prof?.nome || '')}"></label>
      <div class="linha">
        <div><label>Especialidade<input name="especialidade" value="${esc(prof?.especialidade || '')}"></label></div>
        <div><label>Telefone<input name="telefone" value="${esc(prof?.telefone || '')}"></label></div>
      </div>
      <label>Serviços que realiza</label>
      <div class="chks">${servicos.map((s) => `
        <label class="chk"><input type="checkbox" name="serv" value="${s.id}" ${servIds.has(s.id) ? 'checked' : ''}> ${esc(s.nome)}</label>`).join('')}</div>
      <label>Dias e horários de trabalho</label>
      <div id="grade-horarios">
        ${[1, 2, 3, 4, 5, 6, 0].map((dia) => {
          const hs = horarios.filter((h) => h.dia_semana === dia);
          return `<div class="linha-dia" data-dia="${dia}">
            <label class="chk"><input type="checkbox" class="chk-dia" ${hs.length ? 'checked' : ''}> ${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dia]}</label>
            <div class="horas-dia" style="${hs.length ? '' : 'display:none'}">
              ${hs.map((h) => `
                <div class="linha">
                  <input type="time" class="hi" value="${h.hora_inicio}"> –
                  <input type="time" class="hf" value="${h.hora_fim}">
                </div>`).join('') || '<div class="linha"><input type="time" class="hi" value="09:00"> – <input type="time" class="hf" value="18:00"></div>'}
              <button type="button" class="btn mini btn-sec add-h">+ intervalo</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <label class="chk"><input type="checkbox" name="ativo" ${!prof || prof.ativo ? 'checked' : ''}> Ativo</label>
      <div id="p-erro" class="campo-erro"></div>
      <div class="modal-rodape">
        <button type="button" class="btn btn-sec" id="p-cancel">Cancelar</button>
        <button class="btn btn-primario">Salvar</button>
      </div>
    </form>`);

  $('#p-cancel', m).onclick = () => m.remove();
  $$('.chk-dia', m).forEach((c) => c.onchange = () => {
    c.closest('.linha-dia').querySelector('.horas-dia').style.display = c.checked ? '' : 'none';
  });
  $$('.add-h', m).forEach((b) => b.onclick = () => {
    const div = b.parentElement;
    b.insertAdjacentHTML('beforebegin', '<div class="linha"><input type="time" class="hi" value="09:00"> – <input type="time" class="hf" value="12:00"></div>');
  });

  $('#form-prof', m).onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    corpo.servicoIds = $$('input[name=serv]:checked', m).map((i) => Number(i.value));
    corpo.horarios = [];
    $$('.linha-dia', m).forEach((linha) => {
      if (!linha.querySelector('.chk-dia').checked) return;
      const dia = Number(linha.dataset.dia);
      linha.querySelectorAll('.horas-dia .linha').forEach((h) => {
        const hi = h.querySelector('.hi').value, hf = h.querySelector('.hf').value;
        if (hi && hf) corpo.horarios.push({ dia_semana: dia, hora_inicio: hi, hora_fim: hf });
      });
    });
    corpo.ativo = $('input[name=ativo]', m).checked;
    try {
      await withLoading(async () => {
        if (prof) await put(`/api/profissionais/${prof.id}`, corpo);
        else await post('/api/profissionais', corpo);
        toast('Profissional salvo', 'ok');
        m.remove();
        location.reload();
      });
    } catch (e2) { $('#p-erro', m).textContent = e2.message; }
  };
}

// ==================== SERVIÇOS ====================
async function paginaServicos() {
  const [servs, profs] = await Promise.all([get('/api/servicos'), get('/api/profissionais')]);
  const grupos = agruparServicosPorCategoria(servs);
  const categorias = grupos.map((grupo) => grupo.categoria).filter((categoria) => categoria !== 'Sem categoria');
  layout(`
    <div class="topo"><div><h1>Serviços e preços</h1><p class="texto-fraco">Cadastre serviços, valores, duração e profissionais disponíveis no agendamento online.</p></div><div class="acoes"><button class="btn btn-primario" id="btn-novo">+ Novo serviço</button></div>
    </div>
    <div class="card"><div class="tabela-responsiva" id="tab">
      <table><thead><tr><th>Serviço</th><th>Categoria</th><th>Preço</th><th>Duração</th><th>Intervalo</th><th>Profissionais</th><th>Status</th><th></th></tr></thead><tbody>
      ${grupos.map((grupo, indice) => `
        <tr class="servico-grupo-cabecalho"><th colspan="8"><button type="button" class="servico-grupo-toggle" data-servico-grupo="${indice}" aria-expanded="true"><span>${esc(grupo.categoria)}</span><small>${grupo.servicos.length} ${grupo.servicos.length === 1 ? 'serviço' : 'serviços'}</small><b aria-hidden="true">−</b></button></th></tr>
        ${grupo.servicos.map((s) => `
        <tr>
          <td><b>${esc(s.nome)}</b>${s.descricao ? `<div class="texto-fraco">${esc(s.descricao)}</div>` : ''}</td>
          <td>${esc(s.categoria || '—')}</td>
          <td>${fmtBRL(s.preco_centavos / 100)}</td>
          <td>${fmtDuracao(s.duracao_min)}</td>
          <td>${s.intervalo_min} min</td>
          <td>${s.profissionais.map((p) => esc(p.nome)).join(', ') || '—'}</td>
          <td>${s.ativo ? '<span class="tag st-confirmado">Ativo</span>' : '<span class="tag st-cancelado">Inativo</span>'}</td>
          <td class="cel-acoes"><button class="btn mini btn-sec" data-editar="${s.id}">Editar</button></td>
        </tr>`).join('')}`).join('')}
      </tbody></table>
    </div></div>
  `, 'servicos');

  $$('#tab [data-servico-grupo]').forEach((botao) => botao.onclick = () => {
    const ocultar = botao.getAttribute('aria-expanded') === 'true';
    botao.setAttribute('aria-expanded', String(!ocultar));
    botao.querySelector('b').textContent = ocultar ? '+' : '−';
    const linhas = [...$('#tab tbody').rows];
    const cabecalho = botao.closest('tr');
    let mostrar = false;
    for (const linha of linhas) {
      if (linha === cabecalho) { mostrar = true; continue; }
      if (mostrar && linha.classList.contains('servico-grupo-cabecalho')) break;
      if (mostrar) linha.hidden = ocultar;
    }
  });
  $$('#tab [data-editar]').forEach((b) => b.onclick = () => modalServico(servs.find((x) => x.id == b.dataset.editar), profs, categorias));
  $('#btn-novo').onclick = () => modalServico(null, profs, categorias);
}

function modalServico(s, profs, categorias = []) {
  const profIds = new Set((s?.profissionais || []).map((p) => p.id));
  const duracaoAtual = Number(s?.duracao_min) || 30;
  const horasAtuais = Math.floor(duracaoAtual / 60);
  const minutosAtuais = duracaoAtual % 60;
  const m = UI.modal(`
    <h2>${s ? 'Editar serviço' : 'Novo serviço'}</h2>
    <form id="form-s">
      <label>Nome *<input name="nome" required value="${esc(s?.nome || '')}"></label>
      <label>Descrição<textarea name="descricao" rows="2">${esc(s?.descricao || '')}</textarea></label>
      <div class="linha3">
        <div><label>Categoria<input name="categoria" list="categorias-servico" value="${esc(s?.categoria || '')}" placeholder="Escolha ou digite uma categoria"><datalist id="categorias-servico">${categorias.map((categoria) => `<option value="${esc(categoria)}">`).join('')}</datalist></label></div>
        <div><label>Preço (R$)<input type="number" step="0.01" min="0" name="preco" value="${s ? s.preco_centavos / 100 : ''}"></label></div>
        <div><label>Status<select name="ativo">
          <option value="1" ${!s || s.ativo ? 'selected' : ''}>Ativo</option>
          <option value="0" ${s && !s.ativo ? 'selected' : ''}>Inativo</option></select></label></div>
      </div>
      <div class="linha3">
        <div><label>Horas<input type="number" min="0" step="1" name="duracao_horas" required value="${horasAtuais}"></label></div>
        <div><label>Minutos<input type="number" min="0" max="59" step="1" name="duracao_minutos" required value="${minutosAtuais}"></label></div>
        <div><label>Intervalo adicional (min)<input type="number" min="0" name="intervalo_min" value="${s?.intervalo_min || 0}"></label></div>
      </div>
      <p class="duracao-ajuda">Exemplo: 4 horas e 20 minutos aparecem para a cliente como <b>4h 20min</b>.</p>
      <label>Profissionais habilitados</label>
      <div class="chks">${profs.map((p) => `
        <label class="chk"><input type="checkbox" name="prof" value="${p.id}" ${profIds.has(p.id) ? 'checked' : ''}> ${esc(p.nome)}</label>`).join('')}</div>
      <div id="s-erro" class="campo-erro"></div>
      <div class="modal-rodape">
        <button type="button" class="btn btn-sec" id="s-cancel">Cancelar</button>
        <button class="btn btn-primario">Salvar</button>
      </div>
    </form>`);
  $('#s-cancel', m).onclick = () => m.remove();
  $('#form-s', m).onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    corpo.profissionalIds = $$('input[name=prof]:checked', m).map((i) => Number(i.value));
    corpo.ativo = corpo.ativo === '1';
    const horas = Number(corpo.duracao_horas), minutos = Number(corpo.duracao_minutos);
    if (!Number.isInteger(horas) || horas < 0 || !Number.isInteger(minutos) || minutos < 0 || minutos > 59) {
      $('#s-erro', m).textContent = 'Informe horas inteiras e minutos entre 0 e 59.';
      return;
    }
    corpo.duracao_min = horas * 60 + minutos;
    delete corpo.duracao_horas;
    delete corpo.duracao_minutos;
    if (corpo.duracao_min < 5) {
      $('#s-erro', m).textContent = 'A duração total precisa ser de pelo menos 5 minutos.';
      return;
    }
    try {
      await withLoading(async () => {
        if (s) await put(`/api/servicos/${s.id}`, corpo);
        else await post('/api/servicos', corpo);
        toast('Serviço salvo', 'ok');
        m.remove();
        location.reload();
      });
    } catch (e2) { $('#s-erro', m).textContent = e2.message; }
  };
}

// ==================== SALAS ====================
async function paginaSalas() {
  const salas = await get('/api/salas');
  layout(`
    <div class="topo"><h1>Salas</h1>
      <div class="acoes"><button class="btn btn-primario" id="btn-novo">+ Nova sala</button></div>
    </div>
    <div class="card"><div class="tabela-responsiva">
      <table><thead><tr><th>Nome</th><th>Status</th></tr></thead><tbody>
      ${salas.map((s) => `<tr><td>${esc(s.nome)}</td>
        <td>${s.ativa ? '<span class="tag st-confirmado">Ativa</span>' : '<span class="tag st-cancelado">Inativa</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>
  `, 'salas');
  $('#btn-novo').onclick = () => {
    const m = UI.modal(`<h2>Nova sala</h2><form id="f">
      <label>Nome *<input name="nome" required></label>
      <div class="modal-rodape"><button type="button" class="btn btn-sec" id="c">Cancelar</button><button class="btn btn-primario">Salvar</button></div></form>`);
    $('#c', m).onclick = () => m.remove();
    $('#f', m).onsubmit = async (e) => {
      e.preventDefault();
      await withLoading(async () => {
        await post('/api/salas', Object.fromEntries(new FormData(e.target).entries()));
        toast('Sala criada', 'ok'); m.remove(); location.reload();
      });
    };
  };
}

// ==================== BLOQUEIOS ====================
async function paginaBloqueios() {
  const [bloqueios, profs] = await Promise.all([get('/api/bloqueios'), get('/api/profissionais')]);
  layout(`
    <div class="topo"><h1>Bloqueios de agenda</h1>
      <div class="acoes"><button class="btn btn-primario" id="btn-novo">+ Novo bloqueio</button></div>
    </div>
    <div class="card"><div class="tabela-responsiva">
      <table><thead><tr><th>Período</th><th>Horário</th><th>Profissional</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${bloqueios.map((b) => `
        <tr>
          <td>${fmtData(b.data_inicio)} a ${fmtData(b.data_fim)}</td>
          <td>${b.hora_inicio ? fmtHora(b.hora_inicio) + ' – ' + fmtHora(b.hora_fim) : 'Dia inteiro'}</td>
          <td>${b.profissional ? esc(b.profissional) : '<b>Todos (estabelecimento)</b>'}</td>
          <td>${esc(b.motivo || '—')}</td>
          <td class="cel-acoes"><button class="btn mini btn-perigo" data-ex="${b.id}">Remover</button></td>
        </tr>`).join('')}
      </tbody></table></div></div>
  `, 'bloqueios');

  $$('#tab [data-ex], #app [data-ex]').forEach((b) => b.onclick = async () => {
    await withLoading(async () => { await del(`/api/bloqueios/${b.dataset.ex}`); toast('Bloqueio removido', 'ok'); location.reload(); });
  });

  $('#btn-novo').onclick = () => {
    const m = UI.modal(`
      <h2>Novo bloqueio</h2>
      <form id="fb">
        <label>Profissional (vazio = todos)</label>
        <select name="profissional_id"><option value="">Todos — fecha o estabelecimento</option>
          ${profs.filter((p) => p.ativo).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
        <div class="linha">
          <div><label>De *<input type="date" name="data_inicio" required value="${hojeISO()}"></label></div>
          <div><label>Até *<input type="date" name="data_fim" required value="${hojeISO()}"></label></div>
        </div>
        <div class="linha">
          <div><label>Das (opcional)<input type="time" name="hora_inicio"></label></div>
          <div><label>Até (opcional)<input type="time" name="hora_fim"></label></div>
        </div>
        <label class="texto-fraco">Deixe os horários vazios para bloquear o dia inteiro.</label>
        <label>Motivo<input name="motivo" placeholder="Férias, folga, compromisso…"></label>
        <div id="b-erro" class="campo-erro"></div>
        <div class="modal-rodape"><button type="button" class="btn btn-sec" id="c">Cancelar</button><button class="btn btn-primario">Bloquear</button></div>
      </form>`);
    $('#c', m).onclick = () => m.remove();
    $('#fb', m).onsubmit = async (e) => {
      e.preventDefault();
      const corpo = Object.fromEntries(new FormData(e.target).entries());
      if (!corpo.profissional_id) delete corpo.profissional_id;
      try {
        await withLoading(async () => {
          await post('/api/bloqueios', corpo);
          toast('Bloqueio criado', 'ok'); m.remove(); location.reload();
        });
      } catch (e2) { $('#b-erro', m).textContent = e2.message; }
    };
  };
}

// ==================== CONFIGURAÇÕES ====================
async function paginaConfiguracoes() {
  const [est, func, notif] = await Promise.all([
    get('/api/configuracoes/estabelecimento'), get('/api/funcionamento'), get('/api/configuracoes/notificacoes'),
  ]);
  const temaAtual = Object.hasOwn(TEMAS_CORES, est.temaId) ? est.temaId : 'turquesa-rosa';
  const modoAtual = Object.hasOwn(MODOS_APARENCIA, est.modoAparencia) ? est.modoAparencia : 'claro';
  const modosHtml = Object.entries(MODOS_APARENCIA).map(([id, modo]) => `
    <label class="modo-opcao">
      <input type="radio" name="modoAparencia" value="${id}" ${id === modoAtual ? 'checked' : ''}>
      <span class="modo-cartao"><span class="modo-icone">${modo.icone}</span><strong>${modo.nome}</strong><small>${modo.descricao}</small></span>
    </label>`).join('');
  const temasHtml = Object.entries(TEMAS_CORES).map(([id, tema]) => `
    <label class="tema-opcao">
      <input type="radio" name="temaVisual" value="${id}" ${id === temaAtual ? 'checked' : ''}>
      <span class="tema-cartao">
        <span class="tema-previa" style="background:${tema.fundo}">
          <span class="tema-previa-menu" style="background:${tema.menu};color:${tema.menuTexto}">A+</span>
          <span class="tema-previa-conteudo" style="background:${tema.card}">
            <i style="background:${tema.primaria}"></i><i style="background:${tema.acento}"></i><i style="background:${tema.menuAtivo}"></i>
          </span>
        </span>
        <strong>${tema.nome}</strong><small>${tema.descricao}</small>
        <span class="tema-amostras"><i style="background:${tema.primaria}"></i><i style="background:${tema.acento}"></i><i style="background:${tema.menu}"></i><i style="background:${tema.fundo}"></i></span>
      </span>
    </label>`).join('');
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  layout(`
    <div class="topo"><h1>Configurações</h1></div>
    ${state.user.perfil === 'admin' ? `
    <section class="card temas-config">
      <div class="temas-cabecalho"><div><h2>Paletas de cores</h2><p class="texto-fraco">Escolha uma combinação para o painel e para o agendamento online. A alteração vale para toda a equipe.</p></div><button class="btn btn-primario" id="salvar-tema">Salvar combinação</button></div>
      <h3 class="tema-subtitulo">Tema de aparência</h3>
      <div class="temas-modos" id="modos-aparencia">${modosHtml}</div>
      <h3 class="tema-subtitulo">Paleta de cores</h3>
      <div class="temas-grade" id="temas-cores">${temasHtml}</div>
      <p class="tema-ajuda" id="tema-ajuda">Selecione uma paleta para visualizar a prévia. Salve para aplicá-la em todo o aplicativo.</p>
    </section>` : ''}
    <div class="grade2">
      <div class="card">
        <h2>Estabelecimento</h2>
        <form id="f-est">
          <label>Nome *<input name="nome" required value="${esc(est.nome || '')}"></label>
          <label>Endereço<input name="endereco" value="${esc(est.endereco || '')}"></label>
          <label>Telefone<input name="telefone" value="${esc(est.telefone || '')}"></label>
          <button class="btn btn-primario">Salvar</button>
        </form>
      </div>
      <div class="card">
        <h2>Horário de funcionamento</h2>
        <form id="f-func">
          ${func.map((d) => `
            <div class="linha">
              <label class="chk"><input type="checkbox" class="f-aberto" data-d="${d.dia_semana}" ${d.aberto ? 'checked' : ''}> ${dias[d.dia_semana]}</label>
              <input type="time" class="f-ini" data-d="${d.dia_semana}" value="${d.hora_inicio || '09:00'}">
              <input type="time" class="f-fim" data-d="${d.dia_semana}" value="${d.hora_fim || '18:00'}">
            </div>`).join('')}
          <button class="btn btn-primario">Salvar</button>
        </form>
      </div>
    </div>
    <div class="card">
      <h2>Notificações</h2>
      <p class="texto-fraco">As notificações ficam registradas no sistema. O envio real por e-mail/WhatsApp/SMS exige credenciais do provedor — enquanto não configuradas, nada é enviado e os registros aparecem como "desabilitada".</p>
      <form id="f-notif">
        <div class="linha3">
          <div><label>E-mail habilitado?<select name="email_hab">
            <option value="0" ${!notif.email?.habilitado ? 'selected' : ''}>Não (padrão)</option>
            <option value="1" ${notif.email?.habilitado ? 'selected' : ''}>Sim</option></select></label></div>
          <div><label>WhatsApp habilitado?<select name="zap_hab">
            <option value="0" ${!notif.whatsapp?.habilitado ? 'selected' : ''}>Não (padrão)</option>
            <option value="1" ${notif.whatsapp?.habilitado ? 'selected' : ''}>Sim</option></select></label></div>
          <div><label>Lembrete (horas antes)<input type="number" min="1" max="168" name="lembreteHoras" value="${notif.lembreteAntecedenciaHoras || 24}"></label></div>
        </div>
        <p class="texto-fraco">Marcando "Sim" os registros passam a ficar pendentes na fila — conecte um provedor (SMTP/API) para envio real.</p>
        <button class="btn btn-primario">Salvar</button>
      </form>
    </div>
    <div class="card">
      <h2>Últimas notificações geradas</h2>
      <div id="lista-notif" class="texto-fraco">Carregando…</div>
    </div>
  `, 'configuracoes');

  $('#f-est').onsubmit = async (e) => {
    e.preventDefault();
    await withLoading(async () => {
      await put('/api/configuracoes/estabelecimento', Object.fromEntries(new FormData(e.target).entries()));
      toast('Configuração salva', 'ok');
    });
  };
  if (state.user.perfil === 'admin') {
    $('.temas-cabecalho h2').textContent = 'Apar\u00eancia e cores';
    $('.temas-cabecalho p').textContent = 'Combine um tema de apar\u00eancia com uma paleta. A escolha vale para toda a equipe e para o agendamento online.';
    $('#salvar-tema').textContent = 'Salvar apar\u00eancia';
    const atualizarPreviaTema = () => {
      const paleta = $('#temas-cores input[name="temaVisual"]:checked')?.value || 'turquesa-rosa';
      const modo = $('#modos-aparencia input[name="modoAparencia"]:checked')?.value || 'claro';
      aplicarTemaCores(paleta, modo);
      $('#tema-ajuda').textContent = 'Pr\u00e9via: ' + MODOS_APARENCIA[modo].nome + ' \u00b7 ' + TEMAS_CORES[paleta].nome + '. Salve para aplicar para toda a equipe.';
    };
    $('#temas-cores').addEventListener('change', atualizarPreviaTema);
    $('#modos-aparencia').addEventListener('change', atualizarPreviaTema);
    $('#salvar-tema').onclick = async () => {
      const paleta = $('#temas-cores input[name="temaVisual"]:checked')?.value || 'turquesa-rosa';
      const modo = $('#modos-aparencia input[name="modoAparencia"]:checked')?.value || 'claro';
      await withLoading(async () => {
        await put('/api/configuracoes/estabelecimento', { temaId: paleta, modoAparencia: modo });
        aplicarTemaCores(paleta, modo);
        toast('Apar\u00eancia e paleta salvas para todo o aplicativo.', 'ok');
      });
    };
  }
  $('#f-func').onsubmit = async (e) => {
    e.preventDefault();
    const lista = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const aberto = $(`.f-aberto[data-d="${d}"]`).checked;
      return { dia_semana: d, aberto, hora_inicio: $(`.f-ini[data-d="${d}"]`).value, hora_fim: $(`.f-fim[data-d="${d}"]`).value };
    });
    await withLoading(async () => {
      await put('/api/funcionamento', lista);
      toast('Horários salvos', 'ok');
    });
  };
  $('#f-notif').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    await withLoading(async () => {
      await put('/api/configuracoes/notificacoes', {
        email: { ...(notif.email || {}), habilitado: f.email_hab === '1' },
        whatsapp: { ...(notif.whatsapp || {}), habilitado: f.zap_hab === '1' },
        sms: { ...(notif.sms || {}), habilitado: false },
        lembreteAntecedenciaHoras: Number(f.lembreteHoras || 24),
      });
      toast('Preferências salvas', 'ok');
    });
  };
  withLoading(async () => {
    const lista = await get('/api/notificacoes');
    $('#lista-notif').innerHTML = lista.length ? `<div class="tabela-responsiva"><table>
      <thead><tr><th>Quando</th><th>Tipo</th><th>Cliente</th><th>Mensagem</th><th>Status</th></tr></thead><tbody>
      ${lista.slice(0, 20).map((n) => `<tr>
        <td>${new Date(n.criado_em + 'Z').toLocaleString('pt-BR')}</td><td>${esc(n.tipo)}</td>
        <td>${esc(n.cliente || '—')}</td><td>${esc(n.mensagem || '')}</td>
        <td><span class="tag">${esc(n.status)}</span></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma notificação ainda.</div>';
  })();
}

// ==================== USUÁRIOS ====================
async function paginaUsuarios() {
  const [usuarios, profs] = await Promise.all([get('/api/usuarios'), get('/api/profissionais')]);
  layout(`
    <div class="topo"><h1>Usuários</h1>
      <div class="acoes"><button class="btn btn-primario" id="btn-novo">+ Novo usuário</button></div>
    </div>
    <div class="card"><div class="tabela-responsiva">
      <table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Profissional vinculado</th><th>Status</th></tr></thead><tbody>
      ${usuarios.map((u) => `<tr>
        <td><b>${esc(u.nome)}</b></td><td>${esc(u.email)}</td><td>${esc(u.perfil)}</td>
        <td>${esc(u.profissional || '—')}</td>
        <td>${u.ativo ? '<span class="tag st-confirmado">Ativo</span>' : '<span class="tag st-cancelado">Inativo</span>'}</td>
      </tr>`).join('')}</tbody></table></div></div>
  `, 'usuarios');

  $('#btn-novo').onclick = () => {
    const m = UI.modal(`
      <h2>Novo usuário</h2>
      <form id="fu">
        <label>Nome *<input name="nome" required></label>
        <label>E-mail *<input type="email" name="email" required></label>
        <label>Senha * (mín. 8)<input type="password" name="senha" required minlength="8"></label>
        <div class="linha">
          <div><label>Perfil<select name="perfil">
            ${['gestor', 'recepcao', 'profissional', 'admin'].map((p) => `<option>${p}</option>`).join('')}
          </select></label></div>
          <div><label>Profissional vinculado (se for profissional)<select name="profissionalId">
            <option value="">—</option>
            ${profs.filter((p) => p.ativo).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}
          </select></label></div>
        </div>
        <div id="u-erro" class="campo-erro"></div>
        <div class="modal-rodape"><button type="button" class="btn btn-sec" id="c">Cancelar</button><button class="btn btn-primario">Criar</button></div>
      </form>`);
    $('#c', m).onclick = () => m.remove();
    $('#fu', m).onsubmit = async (e) => {
      e.preventDefault();
      const corpo = Object.fromEntries(new FormData(e.target).entries());
      if (!corpo.profissionalId) delete corpo.profissionalId;
      try {
        await withLoading(async () => {
          await post('/api/usuarios', corpo);
          toast('Usuário criado', 'ok'); m.remove(); location.reload();
        });
      } catch (e2) { $('#u-erro', m).textContent = e2.message; }
    };
  };
}

// ==================== SITE PÚBLICO (AGENDAMENTO ONLINE) ====================
function paginaPublica() {
  state.publico = { passo: 1, servico: null, profissional: null, modoProf: 'escolher', data: null, slot: null, categoriaAberta: 0 };
  renderPublico();
}

async function renderPublico(msg) {
  const p = state.publico;
  if (!state.cache.pubConfig) {
    const [cfg, servs] = await Promise.all([get('/api/publico/config'), get('/api/publico/servicos')]);
    state.cache.pubConfig = cfg;
    state.cache.pubServicos = servs;
  }
  if (!state.cache.pubPlanos) {
    try { state.cache.pubPlanos = await get('/api/publico/planos-clube'); }
    catch { state.cache.pubPlanos = []; }
  }
  const cfg = state.cache.pubConfig, servs = state.cache.pubServicos, planosClube = state.cache.pubPlanos || [];
  const planoComServico = (servicoId) => planosClube.filter((pl) => pl.itens.some((i) => i.servico_id === servicoId));

  $('#app').innerHTML = `
 <div class="pub-body">
    <div class="pub-topo">
      <div class="nome">💆 ${esc(cfg.nome)}</div>
      <div class="texto-fraco">${esc(cfg.telefone || '')}</div><a class="btn btn-sec" href="#/login">Entrar</a>
    </div>
    <div class="pub-container">
      <div class="passos">
        <div class="passo ${p.passo >= 1 ? 'ativo' : ''} ${p.passo > 1 ? 'feito' : ''}">1. Serviço</div>
        <div class="passo ${p.passo >= 2 ? 'ativo' : ''} ${p.passo > 2 ? 'feito' : ''}">2. Profissional</div>
        <div class="passo ${p.passo >= 3 ? 'ativo' : ''} ${p.passo > 3 ? 'feito' : ''}">3. Data e hora</div>
        <div class="passo ${p.passo >= 4 ? 'ativo' : ''} ${p.passo > 4 ? 'feito' : ''}">4. Seus dados</div>
        <div class="passo">5. Pix</div>
      </div>
      ${msg ? `<div class="card confirmacao-ok"><div class="icone">✅</div><h2>Agendamento recebido!</h2><p>${esc(msg)}</p><div style="display:flex;gap:10px;justify-content:center;margin-top:20px;"><a class="btn btn-sec" href="/agendar">← Voltar</a><a class="btn btn-primario" href="/agendar" onclick="location.reload()">Fazer outro agendamento</a></div></div>` : `
      <div id="passo-corpo"></div>`}
    </div>
 </div>`;
  if (msg) return;

  // Botão Voltar global na página pública
  const btnVoltarExistente = document.getElementById('btn-voltar-global');
  if (!btnVoltarExistente && p.passo > 1) {
    const btnVoltar = document.createElement('button');
    btnVoltar.id = 'btn-voltar-global';
    btnVoltar.className = 'btn btn-sec';
    btnVoltar.textContent = '← Voltar';
    btnVoltar.style.cssText = 'position:fixed;top:80px;left:20px;z-index:100;padding:10px 18px;';
    btnVoltar.onclick = () => { p.passo = Math.max(1, p.passo - 1); renderPublico(); };
    document.body.appendChild(btnVoltar);
  }
  const corpo = $('#passo-corpo');

  if (p.passo === 1) {
    const grupos = agruparServicosPorCategoria(servs);
    if (!Number.isInteger(p.categoriaAberta) || p.categoriaAberta >= grupos.length) p.categoriaAberta = 0;
    corpo.innerHTML = `
      <h2>Escolha o serviço</h2>
      ${planosClube.length ? `
      <section class="clube-publico">
        <div class="clube-publico-titulo">★ Clube de Assinaturas <small>mensalidade fixa, serviços incluídos todo mês</small></div>
        <div class="planos-grid">
          ${planosClube.map((pl) => `
            <div class="card plano-card clube-publico-plano">
              <div class="plano-topo"><h3>${esc(pl.nome)}</h3></div>
              <div class="plano-preco">${fmtBRL(pl.mensalidade_centavos / 100)}<small>/mês</small></div>
              ${pl.economia_centavos ? `<div class="plano-meta"><span class="plano-economia">Economize ${fmtBRL(pl.economia_centavos / 100)} por mês</span></div>` : ''}
              ${pl.desconto_adicional_pct ? `<div class="plano-meta"><span>+ ${pl.desconto_adicional_pct}% de desconto em outros serviços</span></div>` : ''}
              <div class="plano-itens">${pl.itens.map((i) => `<div><span>${i.quantidade}×</span> ${esc(i.servico)}</div>`).join('')}</div>
              <a class="btn btn-primario" href="#/login" onclick="sessionStorage.setItem('clube-contratar','${pl.id}')">Assinar</a>
            </div>`).join('')}
        </div>
      </section>` : ''}
      <div class="servicos-catalogo">
        ${grupos.map((grupo, indice) => `
          <details class="servicos-categoria" data-categoria="${indice}" ${indice === p.categoriaAberta ? 'open' : ''}>
            <summary><span>${esc(grupo.categoria)}</span><small>${grupo.servicos.length} ${grupo.servicos.length === 1 ? 'serviço' : 'serviços'}</small></summary>
            <div class="lista-servicos">${grupo.servicos.map((s) => `
              <div class="opcao ${p.servico?.id === s.id ? 'sel' : ''}" data-s="${s.id}" data-cat="${indice}">
                <div><b>${esc(s.nome)}</b><div class="texto-fraco">${esc(s.descricao || '')}</div></div>
                <div class="servico-preco"><b>${fmtBRL(s.preco_centavos / 100)}</b><div class="texto-fraco">${fmtDuracao(s.duracao_min)}</div></div>
              </div>`).join('')}
            </div>
          </details>`).join('')}
      </div>
      <button class="btn btn-primario" id="avancar" ${p.servico ? '' : 'disabled'}>Continuar →</button>`;
    $$('.opcao', corpo).forEach((el) => el.onclick = () => {
      p.servico = servs.find((s) => s.id == el.dataset.s);
      p.categoriaAberta = Number(el.dataset.cat) || 0;
      p.profissional = null;
      renderPublico();
    });
    $('#avancar').onclick = () => { p.passo = 2; renderPublico(); };

  } else if (p.passo === 2) {
    const profs = p.servico.profissionais;
    corpo.innerHTML = `
      <h2>Escolha o profissional</h2>
      <div class="lista-servicos">
        <div class="opcao ${p.modoProf === 'auto' ? 'sel' : ''}" data-m="auto">
          <div><b>✨ Automático — primeiro disponível</b><div class="texto-fraco">Buscamos o melhor horário entre todos os profissionais</div></div>
        </div>
        ${profs.map((pr) => `
          <div class="opcao ${p.profissional?.id === pr.id ? 'sel' : ''}" data-p="${pr.id}">
            <div><b>${esc(pr.nome)}</b><div class="texto-fraco">${esc(pr.especialidade || '')}</div></div>
          </div>`).join('')}
      </div>
      <button class="btn btn-sec" id="voltar">← Voltar</button>
      <button class="btn btn-primario" id="avancar" ${(p.profissional || p.modoProf === 'auto') ? '' : 'disabled'}>Continuar →</button>`;
    $$('.opcao[data-m]', corpo).forEach((el) => el.onclick = () => { p.modoProf = 'auto'; p.profissional = null; renderPublico(); });
    $$('.opcao[data-p]', corpo).forEach((el) => el.onclick = () => { p.profissional = profs.find((x) => x.id == el.dataset.p); p.modoProf = 'escolher'; renderPublico(); });
    $('#voltar').onclick = () => { p.passo = 1; renderPublico(); };
    $('#avancar').onclick = () => { p.passo = 3; renderPublico(); };

  } else if (p.passo === 3) {
    corpo.innerHTML = `
      <h2>Escolha data e horário</h2>
      <div class="card"><div class="dias-roleta" id="roleta">carregando…</div></div>
      <div id="slots-dia" class="slots"></div>
      <div id="slot-erro" class="campo-erro"></div>
      <div style="margin-top:14px">
        <button class="btn btn-sec" id="voltar">← Voltar</button>
        <button class="btn btn-primario" id="avancar" disabled>Continuar →</button>
      </div>`;
    $('#voltar').onclick = () => { p.passo = 2; renderPublico(); };
    $('#avancar').onclick = () => { p.passo = 4; renderPublico(); };

    // roleta de 14 dias
    const hoje = new Date();
    const dias = [...Array(14)].map((_, i) => {
      const d = new Date(hoje); d.setDate(d.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    $('#roleta').innerHTML = dias.map((d, i) => `
      <div class="dia-chip ${p.data === d ? 'sel' : ''}" data-d="${d}">
        <div class="d">${DOW[new Date(d + 'T12:00:00').getDay()]}</div>
        <div class="n">${d.slice(8)}</div>
      </div>`).join('');
    async function carregarSlots(data) {
      p.data = data; p.slot = null; $('#avancar').disabled = true;
      $('#slots-dia').innerHTML = '<span class="texto-fraco">Consultando horários…</span>';
      const q = `servico_id=${p.servico.id}&data=${data}` + (p.profissional ? `&profissional_id=${p.profissional.id}` : '');
      const r = await get('/api/publico/slots?' + q);
      const todos = r.resultados.flatMap((r2) => r2.slots.map((h) => ({ h, prof: r2.profissional })));
      if (!todos.length) {
        $('#slots-dia').innerHTML = '<div class="vazio">Nenhum horário disponível nesta data. Escolha outro dia.</div>';
        return;
      }
      $('#slots-dia').innerHTML = todos.map((t) =>
        `<div class="slot" data-h="${t.h}" data-p="${t.prof.id}">${t.h}${p.modoProf === 'auto' ? `<div class="texto-fraco" style="font-size:11px">${esc(t.prof.nome)}</div>` : ''}</div>`).join('');
      $$('.slot', corpo).forEach((el) => el.onclick = () => {
        p.slot = el.dataset.h;
        if (p.modoProf === 'auto') p.profissional = { id: Number(el.dataset.p) };
        $$('.slot', corpo).forEach((x) => x.classList.remove('sel'));
        el.classList.add('sel');
        $('#avancar').disabled = false;
      });
    }
    $$('.dia-chip', corpo).forEach((el) => el.onclick = () => {
      $$('.dia-chip', corpo).forEach((x) => x.classList.remove('sel'));
      el.classList.add('sel');
      carregarSlots(el.dataset.d);
    });
    if (!p.data) { $$('.dia-chip', corpo)[0].classList.add('sel'); carregarSlots(dias[0]); }
    else carregarSlots(p.data);

  } else if (p.passo === 4) {
    // Verifica se tem desconto de 10% (agendamento via app)
    const valorServico = p.servico.valor_final_centavos || p.servico.preco_centavos;
    const temDesconto = p.servico.valor_final_centavos && p.servico.valor_final_centavos < p.servico.preco_centavos;
    const valorSinal = Math.round(valorServico / 2);
    corpo.innerHTML = '<h2>Confirme seu agendamento</h2>' +
      '<div class="card"><p><b>' + esc(p.servico.nome) + '</b> · ' + fmtData(p.data) + ' às ' + p.slot + ' · ' + esc(p.profissional?.nome || '') + '</p>' +
      '<div class="pix-resumo"><span>Valor do serviço <b>' + fmtBRL(p.servico.preco_centavos / 100) + '</b></span>' +
      '<span>Sinal Pix de 50% <b>' + fmtBRL(valorSinal / 100) + '</b></span>' +
      '<span>Restante no atendimento <b>' + fmtBRL((p.servico.preco_centavos - valorSinal) / 100) + '</b></span></div>' +
      '<form id="f-dados">' +
      '<label>Nome completo *<input name="nome" required></label>' +
      '<label>WhatsApp / Telefone *<input name="telefone" required placeholder="(00) 00000-0000"></label>' +
      '<label>E-mail<input type="email" name="email"></label>' +
      '<label class="pix-aceite"><input type="checkbox" name="aceitar_cancelamento" required> Li e aceito: para cancelar com 2 horas ou mais, o sinal de 50% será devolvido; com menos de 2 horas, serão retidos 20% do valor total do serviço e o restante do sinal será devolvido. Os direitos previstos na legislação aplicável permanecem preservados.</label>' +
      '<div id="d-erro" class="campo-erro"></div>' +
      '<button class="btn btn-primario" style="width:100%">Continuar para o Pix</button>' +
      '<div style="margin-top:8px"><button type="button" class="btn btn-sec" id="voltar" style="width:100%">← Voltar</button></div>' +
      '</form></div>';
    $('#voltar').onclick = () => { p.passo = 3; renderPublico(); };
    $('#f-dados').onsubmit = async (e) => {
      e.preventDefault();
      const cliente = Object.fromEntries(new FormData(e.target).entries());
      const aceitouRegras = e.target.elements.aceitar_cancelamento.checked;
      delete cliente.aceitar_cancelamento;
      try {
        await withLoading(async () => {
          const r = await postPublico('/api/publico/agendar', {
            servico_id: p.servico.id, profissional_id: p.profissional.id,
            data: p.data, hora_inicio: p.slot, cliente,
            aceitou_regras: aceitouRegras,
          });
          p.pagamento = r.pagamento;
          p.checkoutToken = r.token;
          p.passo = 5;
          renderPublico();
        });
      } catch (e2) {
        $('#d-erro', corpo).textContent = e2.message;
        if (/ocupado|indispon/i.test(e2.message)) { p.passo = 3; setTimeout(() => renderPublico(), 1500); }
      }
    };
  } else if (p.passo === 5) {
    const pg = p.pagamento;
    corpo.innerHTML = '<h2>Pague o sinal via Pix</h2>' +
      '<div class="card pix-checkout">' +
      '<p>Leia o QR Code com o aplicativo do seu banco ou use o Pix Copia e Cola.</p>' +
      '<p><b>' + esc(p.servico.nome) + '</b> \u00b7 ' + fmtData(p.data) + ' \u00e0s ' + p.slot + '</p>' +
      '<div class="pix-valor">Sinal de 50% <strong>' + fmtBRL(pg.valorSinalCentavos / 100) + '</strong></div>' +
      '<div class="pix-qr"><img src="' + esc(pg.pixQrDataUri || '') + '" alt="QR Code Pix com o valor do sinal"></div>' +
      '<p class="texto-fraco">Recebedor: <b>' + esc(pg.nomeRecebedor || 'Estabelecimento') + '</b><br>Chave Pix: <b>' + esc(pg.chavePix || '') + '</b></p>' +
      '<label>Pix Copia e Cola<textarea id="pix-codigo" readonly rows="5">' + esc(pg.pixCopiaECola || '') + '</textarea></label>' +
      '<button type="button" class="btn btn-sec" id="copiar-pix">Copiar c\u00f3digo Pix</button>' +
      '<p class="pix-prazo">A reserva do hor\u00e1rio fica guardada por <b id="pix-contagem">--:--</b> para voc\u00ea pagar.</p>' +
      '<div id="pix-status" class="pix-status">Depois de pagar, avise a equipe. O hor\u00e1rio ser\u00e1 confirmado ap\u00f3s a confer\u00eancia do recebimento.</div>' +
      '<button type="button" class="btn btn-primario" id="informar-pix" style="width:100%;margin-top:10px">J\u00e1 fiz o Pix \u00b7 avisar estabelecimento</button>' +
      '<p class="texto-fraco">N\u00e3o confirme antes de concluir o Pix. O restante de 50% \u00e9 pago no atendimento.</p>' +
      '<button type="button" class="btn btn-sec" id="novo-agendamento" style="display:none">Escolher outro hor\u00e1rio</button>' +
      '</div>';
    $('#copiar-pix').onclick = async () => {
      const campo = $('#pix-codigo');
      try { await navigator.clipboard.writeText(campo.value); }
      catch { campo.focus(); campo.select(); document.execCommand('copy'); }
      toast('C\u00f3digo Pix copiado.', 'ok');
    };
    $('#novo-agendamento').onclick = () => { paginaPublica(); };
    if (p.pollHandle) clearInterval(p.pollHandle);
    if (p.clockHandle) clearInterval(p.clockHandle);
    const statusEl = $('#pix-status'), informarBtn = $('#informar-pix');
    const pararContagem = () => { if (p.clockHandle) clearInterval(p.clockHandle); p.clockHandle = null; };
    const atualizarContagem = () => {
      const restante = Math.max(0, Date.parse(pg.expiraEm) - Date.now());
      const minutos = String(Math.floor(restante / 60000)).padStart(2, '0');
      const segundos = String(Math.floor((restante % 60000) / 1000)).padStart(2, '0');
      const el = $('#pix-contagem'); if (el) el.textContent = minutos + ':' + segundos;
      if (!restante && !pg.clienteInformou) consultar();
    };
    const consultar = async () => {
      try {
        const atual = await get('/api/publico/agendamentos/' + pg.id + '/pagamento?token=' + encodeURIComponent(p.checkoutToken));
        if (atual.status === 'pago') {
          statusEl.className = 'pix-status pix-ok'; statusEl.textContent = 'Pagamento conferido pelo estabelecimento. Seu agendamento est\u00e1 confirmado.';
          informarBtn.style.display = 'none'; pararContagem(); if (p.pollHandle) clearInterval(p.pollHandle);
        } else if (['reembolso_pendente', 'reembolsado', 'reembolso_parcial'].includes(atual.status)) {
          statusEl.className = 'pix-status';
          statusEl.textContent = atual.status === 'reembolso_pendente'
            ? 'Agendamento cancelado. A cl\u00ednica far\u00e1 a devolu\u00e7\u00e3o Pix manualmente e atualizar\u00e1 o status.'
            : 'Agendamento cancelado. A devolu\u00e7\u00e3o Pix foi registrada pela cl\u00ednica.';
          informarBtn.style.display = 'none'; pararContagem(); if (p.pollHandle) clearInterval(p.pollHandle);
        } else if (['expirado', 'cancelado', 'retido'].includes(atual.status)) {
          statusEl.className = 'pix-status pix-erro';
          statusEl.textContent = atual.status === 'cancelado'
            ? 'Este agendamento foi cancelado. Se voc\u00ea fez o Pix, entre em contato com a cl\u00ednica para conferirmos.'
            : atual.status === 'retido' ? 'Agendamento cancelado. O valor do sinal foi retido conforme a regra aceita.'
              : 'O prazo da reserva terminou. N\u00e3o use mais este QR; se j\u00e1 pagou, fale com a cl\u00ednica para conferirmos.';
          informarBtn.style.display = 'none'; pararContagem(); if (p.pollHandle) clearInterval(p.pollHandle);
        } else if (atual.clienteInformou) {
          statusEl.className = 'pix-status'; statusEl.textContent = 'Avisamos a equipe. Ela vai conferir o cr\u00e9dito no banco e confirmar seu hor\u00e1rio.';
          informarBtn.style.display = 'none'; pararContagem();
        } else if (atual.status === 'erro') {
          statusEl.className = 'pix-status pix-erro'; statusEl.textContent = 'O prazo da reserva terminou. N\u00e3o use mais este QR; se j\u00e1 pagou, fale com a cl\u00ednica para conferirmos.';
          $('#pix-codigo').disabled = true; informarBtn.style.display = 'none'; $('#novo-agendamento').style.display = '';
          pararContagem(); if (p.pollHandle) clearInterval(p.pollHandle);
        }
      } catch { }
    };
    informarBtn.onclick = async () => {
      informarBtn.disabled = true;
      try {
        await postPublico('/api/publico/agendamentos/' + pg.id + '/pagamento/informar?token=' + encodeURIComponent(p.checkoutToken), {});
        pg.clienteInformou = true; informarBtn.style.display = 'none'; pararContagem(); await consultar();
      } catch (erro) { toast(erro.message || 'N\u00e3o foi poss\u00edvel avisar a equipe.', 'erro'); informarBtn.disabled = false; }
    };
    atualizarContagem(); consultar();
    p.clockHandle = setInterval(atualizarContagem, 1000);
    p.pollHandle = setInterval(consultar, 5000);
  }
}
async function paginaDadosIniciais() {
  const dados = await get('/api/admin/dados-iniciais');
  const nomes = { usuarios: 'Contas de demonstração', servicos: 'Serviços', profissionais: 'Profissionais', salas: 'Salas', horarios_trabalho: 'Horários individuais', pausas_trabalho: 'Pausas de trabalho', horario_funcionamento: 'Horário da clínica (preservado)' };
  const itens = Object.keys(nomes).map((chave) => '<li><span>' + nomes[chave] + '</span><b>' + Number(dados.contagens[chave] || 0) + '</b></li>').join('');
  layout('<div class="topo"><div><h1>Limpar dados iniciais</h1><p class="texto-fraco">Remova apenas cadastros de demonstração criados na inicialização.</p></div></div>' +
    '<section class="card cleanup-card"><h2>Prévia da limpeza</h2><ul class="cleanup-counts">' + itens + '</ul>' +
    '<p>' + esc(dados.observacao) + '</p><p class="texto-fraco">O acesso do administrador é preservado. Itens ligados a agendamentos ou usuários reais serão arquivados, mantendo o histórico.</p>' +
    '<form id="form-limpeza"><label>Senha atual do administrador<input type="password" name="senha" required autocomplete="current-password"></label>' +
    '<label>Confirme digitando: <b>LIMPAR DADOS DE DEMONSTRACAO</b><input name="confirmacao" required autocomplete="off"></label>' +
    '<button class="btn btn-perigo">Limpar somente os dados iniciais</button></form></section>', 'dados-iniciais');
  $('#form-limpeza').onsubmit = async (e) => {
    e.preventDefault();
    const corpo = Object.fromEntries(new FormData(e.target).entries());
    if (!confirmar('Confirma a remoção dos registros de demonstração marcados?')) return;
    await withLoading(async () => {
      const resultado = await post('/api/admin/dados-iniciais/limpar', corpo);
      const total = Object.values(resultado.apagados).reduce((a, n) => a + n, 0);
      toast(total + ' registro(s) inicial(is) removido(s). O administrador e dados reais foram preservados.', 'ok');
      await paginaDadosIniciais();
    });
  };
}
// ==================== CLUBE DE ASSINATURAS (ADMIN) ====================
const centavos = (c) => fmtBRL(Number(c || 0) / 100);
async function paginaClube() {
  const [planos, assinaturas, ind] = await Promise.all([
    get('/api/clube/planos'), get('/api/clube/assinaturas'), get('/api/clube/indicadores'),
  ]);
  layout(`
    <div class="topo"><div><h1>Clube de Assinaturas</h1><p class="texto-fraco">Planos de mensalidade com direitos de utilização de serviços.</p></div>
      <div class="acoes"><button class="btn btn-primario" id="btn-novo-plano">+ Novo plano</button></div></div>
    <div class="grade-kpi">
      <div class="card kpi"><small>Assinantes ativos</small><b>${ind.assinantes_ativos}</b></div>
      <div class="card kpi"><small>Receita contratada/mês</small><b>${centavos(ind.mrr_contratado_centavos)}</b></div>
      <div class="card kpi"><small>Receita recebida</small><b>${centavos(ind.receita_recebida_centavos)}</b></div>
      <div class="card kpi"><small>Pagamentos pendentes</small><b>${ind.pagamentos_pendentes}</b></div>
      <div class="card kpi"><small>Canceladas</small><b>${ind.assinaturas_canceladas}</b></div>
      <div class="card kpi"><small>Benefícios disponíveis</small><b>${ind.beneficios_disponiveis}</b></div>
    </div>
    <section class="dash-section"><h2>Planos</h2><div class="planos-grid">${planos.map(cardPlano).join('') || '<div class="vazio">Nenhum plano cadastrado.</div>'}</div></section>
    <section class="dash-section"><h2>Assinaturas</h2>
      <div class="card tabela-responsiva"><table><thead><tr><th>Cliente</th><th>Plano</th><th>Mensalidade</th><th>Status</th><th>Início</th><th></th></tr></thead><tbody>
      ${assinaturas.map((a) => `<tr><td>${esc(a.cliente)}</td><td>${esc(a.plano)}</td><td>${centavos(a.mensalidade_centavos)}</td>
        <td><span class="tag-assin ${a.status}">${({ pendente: 'Pendente', ativa: 'Ativa', cancelada: 'Cancelada', cancelamento_solicitado: 'Cancel. solicitado', expirada: 'Expirada' }[a.status] || a.status)}</span></td>
        <td>${a.inicio_em ? fmtData(a.inicio_em) : '—'}</td>
        <td><button class="btn mini btn-sec" data-ver="${a.id}">Detalhes</button></td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma assinatura.</td></tr>'}
      </tbody></table></div>
    </section>
    <section class="dash-section"><h2>Serviços mais utilizados</h2><div class="card">${ind.servicos_mais_utilizados.map((s) => `<div class="linha-uso"><span>${esc(s.servico)}</span><b>${s.vezes} utilização(ões)</b></div>`).join('') || '<div class="vazio">Sem utilização registrada.</div>'}</div></section>
  `, 'clube');

  $('#btn-novo-plano').onclick = () => modalPlano(null);
  $$('.planos-grid [data-editar-plano]').forEach((b) => b.onclick = () => modalPlano(planos.find((p) => p.id === Number(b.dataset.editarPlano))));
  $$('.planos-grid [data-ativar-plano]').forEach((b) => b.onclick = async () => {
    const plano = planos.find((p) => p.id === Number(b.dataset.ativarPlano));
    await withLoading(async () => {
      await post(`/api/clube/planos/${plano.id}`, { ativo: !plano.ativo });
      toast(plano.ativo ? 'Plano desativado.' : 'Plano ativado.', 'ok');
      paginaClube();
    });
  });
  $$('.planos-grid [data-excluir-plano]').forEach((b) => b.onclick = async () => {
    const plano = planos.find((p) => p.id === Number(b.dataset.excluirPlano));
    if (!confirmar(`Excluir o plano "${plano.nome}"?`)) return;
    await withLoading(async () => {
      try { await del(`/api/clube/planos/${plano.id}`); toast('Plano excluído.', 'ok'); paginaClube(); }
      catch (e) { toast(e.message, 'erro'); }
    });
  });
  $$('[data-ver]').forEach((b) => b.onclick = async () => {
    const a = await get(`/api/clube/assinaturas/${b.dataset.ver}`);
    modalAssinatura(a);
  });
}
function cardPlano(p) {
  return `<div class="card plano-card ${p.ativo ? '' : 'plano-inativo'}">
    <div class="plano-topo"><h3>${esc(p.nome)}</h3><span class="plano-badge ${p.ativo ? 'ativo' : ''}">${p.ativo ? 'Ativo' : 'Inativo'}</span></div>
    <p class="texto-fraco">${esc(p.descricao || '')}</p>
    <div class="plano-preco">${centavos(p.mensalidade_centavos)}<small>/mês</small></div>
    <div class="plano-meta"><span>${p.itens.length} serviço(s)</span><span>Avulso: ${centavos(p.avulso_centavos)}</span><span class="plano-economia">Economia: ${centavos(p.economia_centavos)}</span>${p.desconto_adicional_pct ? `<span>Desconto extra: ${p.desconto_adicional_pct}%</span>` : ''}</div>
    <div class="plano-itens">${p.itens.map((i) => `<div><span>${i.quantidade}×</span> ${esc(i.servico)}</div>`).join('')}</div>
    <div class="plano-acoes">
      <button class="btn mini btn-sec" data-editar-plano="${p.id}">Editar</button>
      <button class="btn mini btn-sec" data-ativar-plano="${p.id}">${p.ativo ? 'Desativar' : 'Ativar'}</button>
      <button class="btn mini btn-perigo" data-excluir-plano="${p.id}">Excluir</button>
    </div>
  </div>`;
}
async function modalPlano(plano) {
  const servs = (await get('/api/servicos?ativos=1')).filter((s) => s.ativo);
  const itens = plano ? plano.itens.map((i) => ({ servico_id: i.servico_id, quantidade: i.quantidade })) : [];
  const m = UI.modal(`
    <h2>${plano ? 'Editar plano' : 'Novo plano'}</h2>
    <form id="form-plano">
      <label>Nome *<input name="nome" required value="${esc(plano?.nome || '')}"></label>
      <label>Descrição<textarea name="descricao" rows="2">${esc(plano?.descricao || '')}</textarea></label>
      <div class="linha">
        <div><label>Mensalidade (R$) *<input name="mensalidade" type="number" step="0.01" min="0.01" required value="${plano ? (plano.mensalidade_centavos / 100).toFixed(2) : ''}"></label></div>
        <div><label>Desconto adicional (%)<input name="desconto" type="number" min="0" max="100" value="${plano?.desconto_adicional_pct ?? 0}"></label></div>
      </div>
      <div class="linha">
        <div><label>Validade dos benefícios (dias)<input name="validade" type="number" min="1" value="${plano?.validade_beneficios_dias ?? 31}"></label></div>
        <div><label>Aviso mínimo p/ cancelar (dias)<input name="cancelamento" type="number" min="0" value="${plano?.cancelamento_dias ?? 0}"></label></div>
      </div>
      <label><input type="checkbox" name="transferir" ${plano?.transferir_expirados ? 'checked' : ''}> Transferir benefícios não usados para o próximo ciclo</label>
      <h3>Serviços incluídos</h3>
      <div id="plano-itens-editor"></div>
      <button type="button" class="btn btn-sec" id="add-item">+ Adicionar serviço</button>
      <div class="plano-calculo" id="plano-calculo"></div>
      <div class="modal-rodape">
        <button type="button" class="btn btn-sec" id="p-cancelar">Cancelar</button>
        <button class="btn btn-primario">Salvar</button>
      </div>
    </form>`);
  $('#p-cancelar', m).onclick = () => m.remove();
  const editor = $('#plano-itens-editor', m);
  function addLinha(item = { servico_id: '', quantidade: 1 }) {
    const div = document.createElement('div');
    div.className = 'linha-item';
    div.innerHTML = `<select class="item-servico"><option value="">— selecionar —</option>${servs.map((s) => `<option value="${s.id}" ${item.servico_id == s.id ? 'selected' : ''}>${esc(s.nome)} (${centavos(s.preco_centavos)})</option>`).join('')}</select>
      <input class="item-qtd" type="number" min="1" value="${item.quantidade}" aria-label="Quantidade">
      <button type="button" class="btn mini btn-perigo" aria-label="Remover">×</button>`;
    div.querySelector('.btn-perigo').onclick = () => div.remove();
    div.onchange = recalcular;
    editor.append(div);
  }
  function recalcular() {
    let avulso = 0;
    $$('.linha-item', editor).forEach((linha) => {
      const s = servs.find((x) => x.id === Number(linha.querySelector('.item-servico').value));
      const qtd = Number(linha.querySelector('.item-qtd').value || 1);
      if (s) avulso += s.preco_centavos * qtd;
    });
    const mens = Math.round(Number($('input[name=mensalidade]', m).value || 0) * 100);
    $('#plano-calculo', m).innerHTML = avulso
      ? `Avulso total: <b>${centavos(avulso)}</b> · Mensalidade: <b>${centavos(mens)}</b> · ${mens <= avulso ? `Economia do cliente: <b class="ok">${centavos(avulso - mens)}</b>` : `<b class="erro">Atenção: mensalidade maior que o valor avulso</b>`}` : '';
  }
  $('#add-item', m).onclick = () => { addLinha(); recalcular(); };
  itens.forEach(addLinha);
  $('input[name=mensalidade]', m).oninput = recalcular;
  recalcular();
  $('#form-plano', m).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const itensSelecionados = $$('.linha-item', editor).map((linha) => ({
      servico_id: Number(linha.querySelector('.item-servico').value),
      quantidade: Number(linha.querySelector('.item-qtd').value || 1),
    })).filter((i) => i.servico_id);
    if (!itensSelecionados.length) { toast('Adicione pelo menos um serviço ao plano.', 'erro'); return; }
    loading(true);
    try {
      const corpo = {
        nome: f.get('nome'), descricao: f.get('descricao'),
        mensalidade_centavos: Math.round(Number(f.get('mensalidade')) * 100),
        desconto_adicional_pct: Number(f.get('desconto') || 0),
        validade_beneficios_dias: Number(f.get('validade') || 31),
        cancelamento_dias: Number(f.get('cancelamento') || 0),
        transferir_expirados: !!f.get('transferir'),
        itens: itensSelecionados,
      };
      if (plano) await put(`/api/clube/planos/${plano.id}`, corpo);
      else await post('/api/clube/planos', corpo);
      toast('Plano salvo.', 'ok'); m.remove(); paginaClube();
    } catch (err) { toast(err.message, 'erro'); }
    finally { loading(false); }
  };
}
async function modalAssinatura(a) {
  const statusLabels = { pendente: 'Pendente', ativa: 'Ativa', cancelada: 'Cancelada', cancelamento_solicitado: 'Cancelamento solicitado', expirada: 'Expirada' };
  const m = UI.modal(`
    <h2>Assinatura · ${esc(a.cliente)}</h2>
    <p><b>${esc(a.plano)}</b> · ${centavos(a.mensalidade_centavos)}/mês ${a.desconto_adicional_pct ? `· desconto extra ${a.desconto_adicional_pct}%` : ''}</p>
    <div class="linha" style="align-items:center">
      <div><label>Status</label><select id="as-status">${['pendente','ativa','cancelada','cancelamento_solicitado','expirada'].map((s) => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${statusLabels[s]}</option>`).join('')}</select></div>
      <div><label>Início</label><input value="${a.inicio_em ? fmtData(a.inicio_em) : '—'}" disabled></div>
      <div><button class="btn btn-primario" id="as-status-salvar" style="margin-top:22px">Salvar status</button></div>
    </div>
    <h3>Ciclo atual</h3>
    ${a.ciclo ? `<p>${fmtData(a.ciclo.inicio_em)} a ${fmtData(a.ciclo.fim_em)} · ${statusLabels[a.ciclo.status] ? ({ aguardando_pagamento: 'Aguardando pagamento', ativo: 'Ativo', expirado: 'Expirado', cancelado: 'Cancelado' }[a.ciclo.status]) : esc(a.ciclo.status)}</p>
      ${a.ciclo.status === 'aguardando_pagamento' ? '<button class="btn btn-primario" id="as-pagar">Confirmar pagamento da mensalidade</button>' : ''}` : '<p class="vazio">Nenhum ciclo ainda.</p>'}
    <h3>Benefícios do ciclo</h3>
    <div class="tabela-responsiva"><table><thead><tr><th>Serviço</th><th>Contratado</th><th>Usados</th><th>Reservados</th><th>Restantes</th></tr></thead><tbody>
    ${a.beneficios.map((b) => `<tr><td>${esc(b.servico)}</td><td>${b.quantidade}</td><td>${b.usados}</td><td>${b.reservados}</td><td><b>${b.quantidade - b.usados - b.reservados}</b></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">—</td></tr>'}
    </tbody></table></div>
    <h3>Pagamentos</h3>
    <div class="tabela-responsiva"><table><thead><tr><th>Valor</th><th>Status</th><th>Vencimento/ciclo</th><th>Pago em</th></tr></thead><tbody>
    ${a.pagamentos.map((p) => `<tr><td>${centavos(p.valor_centavos)}</td><td>${({ pendente: 'Pendente', pago: 'Pago', recusado: 'Recusado', cancelado: 'Cancelado', reembolsado: 'Reembolsado' }[p.status] || p.status)}</td><td>${p.ciclo_inicio ? `${fmtData(p.ciclo_inicio)}–${fmtData(p.ciclo_fim)}` : '—'}</td><td>${p.pago_em ? fmtData(p.pago_em) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">—</td></tr>'}
    </tbody></table></div>
    <h3>Histórico de utilização</h3>
    <div class="tabela-responsiva"><table><thead><tr><th>Data</th><th>Serviço</th><th>Ação</th></tr></thead><tbody>
    ${a.utilizacao.map((u) => `<tr><td>${u.ag_data ? `${fmtData(u.ag_data)} ${fmtHora(u.hora_inicio)}` : '—'}</td><td>${esc(u.servico)}</td><td>${({ reservado: 'Reservado', consumido: 'Consumido', liberado: 'Liberado', expirado: 'Expirado', transferido: 'Transferido' }[u.acao] || u.acao)}</td></tr>`).join('') || '<tr><td colspan="3" class="vazio">—</td></tr>'}
    </tbody></table></div>
    <div class="modal-rodape"><button type="button" class="btn btn-sec" id="as-fechar">Fechar</button></div>`);
  $('#as-fechar', m).onclick = () => m.remove();
  $('#as-status-salvar', m).onclick = async () => {
    await withLoading(async () => {
      await post(`/api/clube/assinaturas/${a.id}/status`, { status: $('#as-status', m).value });
      toast('Status atualizado.', 'ok'); m.remove(); paginaClube();
    });
  };
  const pagar = $('#as-pagar', m);
  if (pagar) pagar.onclick = async () => {
    await withLoading(async () => {
      await post(`/api/clube/assinaturas/${a.id}/pagamento`, {});
      toast('Pagamento confirmado e ciclo ativado.', 'ok'); m.remove(); paginaClube();
    });
  };
}

// ==================== ROTEADOR ====================
async function rotear() {
  const hash = location.hash.slice(2) || '';
  const [rota, qs] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  state.rota = rota;

  // rotas públicas
  if (rota === 'login') { pararMonitorAgendamentos(); telaLogin(); return; }
  if (rota === 'cliente-cadastro') { telaCadastroCliente(); return; }
  if (rota === 'minha-conta') { await paginaContaCliente(); return; }
  if (rota === 'meu-clube') { await paginaClubeCliente(); return; }
  if (rota === 'recuperar') { telaRecuperar(); return; }
  if (location.pathname === '/agendar') { paginaPublica(); return; }

  // exige sessão
  if (!state.user) {
    try { state.user = JSON.parse(sessionStorage.getItem('usuario') || 'null'); } catch { state.user = null; }
    if (!state.user) { location.hash = '#/login'; return; }
  }
  // valida a sessão no servidor
  try {
    const atual = await get('/api/usuario-atual');
    state.user = atual;
    sessionStorage.setItem('usuario', JSON.stringify(atual));
  } catch { return; }

  if (state.user.perfil === 'admin') iniciarMonitorAgendamentos();
  else pararMonitorAgendamentos();

  const paginas = {
    dashboard: paginaDashboard,
    agenda: paginaAgenda,
    clientes: paginaClientes,
    financeiro: paginaFinanceiro,
    profissionais: paginaProfissionais,
    servicos: paginaServicos,
    clube: paginaClube,
    salas: paginaSalas,
    bloqueios: paginaBloqueios,
    configuracoes: paginaConfiguracoes,
    usuarios: paginaUsuarios,
    'dados-iniciais': paginaDadosIniciais,
  };
  const fn = paginas[rota] || paginaDashboard;
  await fn(params);
}

window.addEventListener('hashchange', rotear);
(async () => { await carregarTemaSalvo(); await rotear(); })();

/* ===== Botao WhatsApp na agenda (abre conversa com o cliente) ===== */
(function(){
  if (window._whatsAgendaInit) return;
  window._whatsAgendaInit = true;

  var STATUS_TXT = { pendente:'Pendente', confirmado:'Confirmado', em_atendimento:'Em atendimento', finalizado:'Finalizado', falta:'Falta', cancelado:'Cancelado' };

  async function nomeClinica(){
    if (window._cfgNome) return window._cfgNome;
    try {
      var r = await fetch('/api/publico/config');
      var cfg = await r.json();
      window._cfgNome = (cfg && cfg.nome) ? cfg.nome : 'nosso studio';
    } catch(e){ window._cfgNome = 'nosso studio'; }
    return window._cfgNome;
  }

  function statusDeItem(item){
    var m = (item.className||'').match(/st-([a-z_]+)/);
    return m ? (STATUS_TXT[m[1]] || m[1]) : 'agendado';
  }

  async function abrir(item){
    var cliente = (item.querySelector('.info .cliente')||{}).textContent || '';
    var detalhe = (item.querySelector('.info .detalhe')||{}).textContent || '';
    var horaEl  = (item.querySelector('.hora')||{}).textContent || '';
    var hora    = (horaEl.trim().split(/\s+/)[0]) || '';
    var dataInput = document.querySelector('input[type=date]');
    var dataISO = dataInput ? dataInput.value : '';
    var dataFmt = dataISO ? dataISO.split('-').reverse().join('/') : '';
    var partes  = detalhe.split('·').map(function(s){return s.trim();});
    var servico = partes[0] || '';
    var prof    = partes[1] || '';
    var telMatch = detalhe.match(/(\d[\d\s()-]{8,})$/);
    var tel = telMatch ? telMatch[1].replace(/\D/g,'') : '';
    if(!tel){ alert('Este cliente não tem telefone cadastrado.'); return; }
    if(tel.indexOf('55')!==0) tel = '55'+tel;
    var clinica = await nomeClinica();
    var msg =
      'Olá, '+cliente+'! 👋\n\n'+
      'Aqui é do '+clinica+'. Seu agendamento está *'+statusDeItem(item)+'*:\n\n'+
      '📅 '+dataFmt+' às '+hora+'\n'+
      '💆 '+servico+'\n'+
      '👩‍⚕️ '+prof+'\n\n'+
      'Qualquer dúvida, é só responder aqui! 💙';
    window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(msg), '_blank');
  }

  function injetar(){
    document.querySelectorAll('.item-agenda').forEach(function(item){
      if(item.dataset.whatsDone) return;
      var acoes = item.querySelector('.acoes');
      if(!acoes) return;
      item.dataset.whatsDone = '1';
      var b = document.createElement('button');
      b.className = 'btn btn-mini';
      b.style.cssText = 'background:#25D366;color:#fff;border:none;';
      b.textContent = '💬 WhatsApp';
      b.onclick = function(){ abrir(item); };
      acoes.appendChild(b);
    });
  }

  injetar();
  new MutationObserver(injetar).observe(document.getElementById('app'), {childList:true, subtree:true});
})();