'use strict';
// Testes de integração da API — inicia o servidor em porta própria, testa e encerra.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORTA = 3111;
const BASE = `http://localhost:${PORTA}`;
const PASTA_TESTE = fs.mkdtempSync(path.join(os.tmpdir(), 'gestek-test-'));
const DB_TESTE = path.join(PASTA_TESTE, 'teste.db');

process.env.DB_PATH = DB_TESTE;
process.env.PORT = PORTA;
process.env.NODE_ENV = 'test';
process.env.PIX_CHAVE = '20458502000178';
process.env.PIX_NOME_RECEBEDOR = 'AGENDA TESTE';
process.env.PIX_CIDADE_RECEBEDOR = 'SAO PAULO';

const { db: dbTeste } = require('./db/database');
process.on('exit', () => {
  try { dbTeste.close(); } catch { }
  try { fs.rmSync(PASTA_TESTE, { recursive: true, force: true }); } catch { }
});
const servidor = require('./server.js');

let falhas = 0, testes = 0;
function ok(nome, cond, extra = '') {
  testes++;
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome} ${extra}`); }
}

async function req(metodo, caminho, corpo, token) {
  const opts = { method: metodo, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (corpo !== undefined) opts.body = JSON.stringify(corpo);
  const r = await fetch(BASE + caminho, opts);
  let dados = null;
  try { dados = await r.json(); } catch { }
  return { status: r.status, dados };
}

(async () => {
  await new Promise((r) => setTimeout(r, 600));

  console.log('\n== Autenticação ==');
  let r = await req('POST', '/api/login', { email: 'admin@demo.local', senha: 'errada' });
  ok('login com senha errada → 401', r.status === 401);
  r = await req('POST', '/api/login', { email: 'admin@demo.local', senha: 'admin123' });
  ok('login único identifica administrador', r.status === 200 && r.dados.tipo === 'equipe' && r.dados.usuario.perfil === 'admin' && r.dados.token);
  const admin = r.dados.token;

  let pagina = await fetch(BASE + '/');
  const htmlPagina = await pagina.text();
  ok('painel HTML Agenda+ local servido', pagina.status === 200 && htmlPagina.includes('/js/app.js') && htmlPagina.includes('<title>Agenda+ | Agenda e clientes</title>'));
  pagina = await fetch(BASE + '/js/app.js');
  const codigoApp = await pagina.text();
  ok('frontend usa uma única tela sem seletor ou credenciais expostas', pagina.status === 200 && codigoApp.includes('function telaLogin()') && codigoApp.includes("sessao.tipo === 'cliente'") && !codigoApp.includes('Equipe / administrador') && !codigoApp.includes('admin@demo.local / admin123'));
  ok('agenda usa estados aceitos pela API', pagina.status === 200 && codigoApp.includes('data-acao=\"em_atendimento\"') && !codigoApp.includes('data-acao=\"chegada\"') && codigoApp.includes('finally { loading(false); }'));
  ok('dashboard financeiro, calendario e contas disponiveis', pagina.status === 200 && codigoApp.includes('health-grid') && codigoApp.includes('calendar-nav') && codigoApp.includes('paginaFinanceiro'));
  pagina = await fetch(BASE + '/js/api.js');
  const codigoApi = await pagina.text();
  ok('API exporta o controle de sess\u00e3o', pagina.status === 200 && codigoApi.includes('export { setToken, setClientToken }'));

  r = await req('GET', '/api/dashboard');
  ok('dashboard sem token → 401', r.status === 401);
  r = await req('GET', '/api/dashboard', undefined, admin);
  ok('dashboard com token → 200', r.status === 200 && typeof r.dados.resumo === 'object');

  r = await req('POST', '/api/registrar', { nome: 'Novo Gestor', email: 'gestor@teste.local', senha: 'senha12345' });
  ok('cadastro público da equipe bloqueado → 403', r.status === 403);
  r = await req('POST', '/api/usuarios', { nome: 'Novo Gestor', email: 'gestor@teste.local', senha: 'senha12345', perfil: 'gestor' }, admin);
  ok('admin cria conta da equipe → 201', r.status === 201);
  r = await req('POST', '/api/login', { email: 'gestor@teste.local', senha: 'senha12345' });
  const gestor = r.dados.token;
  ok('gestor também usa o login único', r.status === 200 && r.dados.tipo === 'equipe' && r.dados.usuario.perfil === 'gestor');

  r = await req('POST', '/api/cliente/registrar', { nome: 'Cliente Portal', email: 'portal@teste.local', telefone: '11987654321', senha: 'cliente123' });
  ok('cliente cria conta separada → 201', r.status === 201 && r.dados.token);
  const tokenCadastroCliente = r.dados.token;
  r = await req('GET', '/api/cliente/atual', undefined, tokenCadastroCliente);
  ok('registro cria uma sessão própria de cliente', r.status === 200 && r.dados.email === 'portal@teste.local' && !('senha_hash' in r.dados));
  r = await req('POST', '/api/login', { email: 'portal@teste.local', senha: 'cliente123' });
  ok('mesmo login identifica automaticamente o cliente', r.status === 200 && r.dados.tipo === 'cliente' && r.dados.cliente.email === 'portal@teste.local');
  const clientePortal = r.dados.token;
  r = await req('GET', '/api/dashboard', undefined, clientePortal);
  ok('sessão de cliente não acessa o painel administrativo → 401', r.status === 401);  r = await req('POST', '/api/cliente/login', { email: 'admin@demo.local', senha: 'admin123' });
  ok('conta administrativa não entra pelo login de cliente → 401', r.status === 401);

  r = await req('POST', '/api/login', { email: 'recepcao@demo.local', senha: 'recep123' });
  const recep = r.dados.token;
  r = await req('GET', '/api/financeiro', undefined, recep);
  ok('recepcao nao acessa dados financeiros', r.status === 403);
  r = await req('GET', '/api/dashboard', undefined, recep);
  ok('dashboard da recepcao oculta valores financeiros', r.status === 200 && r.dados.financeiro === null);
  const hojeTeste = new Date();
  const vencimentoTeste = `${hojeTeste.getFullYear()}-${String(hojeTeste.getMonth() + 1).padStart(2, '0')}-${String(hojeTeste.getDate()).padStart(2, '0')}`;
  r = await req('POST', '/api/financeiro', { tipo: 'receber', descricao: 'Teste recebimento', valor: 127.50, vencimento: vencimentoTeste, status: 'nao_pago' }, admin);
  ok('criar conta a receber', r.status === 201);
  const receberId = r.dados.id;
  r = await req('PUT', `/api/financeiro/${receberId}`, { tipo: 'receber', descricao: 'Teste recebimento editado', valor: 127.50, vencimento: vencimentoTeste, status: 'nao_pago' }, admin);
  ok('editar lancamento financeiro', r.status === 200);
  const ontemTeste = new Date(hojeTeste);
  ontemTeste.setDate(ontemTeste.getDate() - 1);
  const vencimentoVencido = `${ontemTeste.getFullYear()}-${String(ontemTeste.getMonth() + 1).padStart(2, '0')}-${String(ontemTeste.getDate()).padStart(2, '0')}`;
  r = await req('POST', '/api/financeiro', { tipo: 'receber', descricao: 'Teste vencido', valor: 33.33, vencimento: vencimentoVencido, status: 'previsto' }, admin);
  ok('criar lancamento vencido previsto', r.status === 201);
  const vencidoId = r.dados.id;
  r = await req('GET', '/api/financeiro?tipo=receber&status=vencido', undefined, admin);
  ok('listar vencidos previstos e nao pagos', r.status === 200 && r.dados.some((x) => x.id === vencidoId));
  r = await req('GET', '/api/financeiro?tipo=receber', undefined, admin);
  ok('listar conta a receber em centavos', r.status === 200 && r.dados.some((x) => x.id === receberId && x.valor_centavos === 12750));
  r = await req('POST', '/api/financeiro', { tipo: 'pagar', descricao: 'Teste pagamento', valor: 25.25, vencimento: vencimentoTeste, status: 'previsto' }, admin);
  ok('criar conta a pagar', r.status === 201);
  const pagarId = r.dados.id;
  r = await req('GET', '/api/dashboard', undefined, admin);
  ok('dashboard agrega resumo e fluxo financeiros', r.status === 200 && r.dados.financeiro.receber_hoje_centavos === 12750 && r.dados.financeiro.pagar_hoje_centavos === 2525 && r.dados.financeiro.fluxo.realizado.length > 0);
  r = await req('GET', '/api/financeiro', undefined, gestor);
  ok('gestor pode consultar financeiro', r.status === 200);
  r = await req('POST', `/api/financeiro/${receberId}/status`, { status: 'realizado' }, admin);
  ok('marcar recebimento como realizado', r.status === 200);
  r = await req('DELETE', `/api/financeiro/${pagarId}`, undefined, admin);
  ok('excluir conta a pagar', r.status === 200);
  r = await req('POST', '/api/financeiro', { tipo: 'invalido', descricao: 'x', valor: 1, vencimento: vencimentoTeste }, admin);
  ok('rejeitar tipo financeiro invalido', r.status === 400);
  r = await req('POST', '/api/usuarios', { nome: 'X', email: 'x@x.local', senha: '12345678', perfil: 'admin' }, recep);
  ok('recepção não pode criar usuários → 403', r.status === 403);

  console.log('\n== Cadastros ==');
  r = await req('POST', '/api/servicos', { nome: 'Teste Serviço', preco: 100, duracao_min: 45, intervalo_min: 5, profissionalIds: [] }, admin);
  ok('criar serviço → 201', r.status === 201);
  const servicoId = r.dados.id;
  r = await req('GET', '/api/servicos', undefined, admin);
  const servico = r.dados.find((s) => s.id === servicoId);
  ok('serviço persistido com preço em centavos', servico && servico.preco_centavos === 10000);

  r = await req('POST', '/api/profissionais', { nome: 'Prof Teste', horarios: [{ dia_semana: 1, hora_inicio: '08:00', hora_fim: '17:00' }] }, admin);
  ok('criar profissional → 201', r.status === 201);
  const profId = r.dados.id;
  // ajusta o horário de funcionamento para 08:00–18:00 na segunda (para o teste de turno)
  r = await req('PUT', '/api/funcionamento', [
    { dia_semana: 0, aberto: false }, { dia_semana: 1, aberto: true, hora_inicio: '08:00', hora_fim: '18:00' },
    { dia_semana: 2, aberto: true, hora_inicio: '09:00', hora_fim: '18:00' }, { dia_semana: 3, aberto: true, hora_inicio: '09:00', hora_fim: '18:00' },
    { dia_semana: 4, aberto: true, hora_inicio: '09:00', hora_fim: '18:00' }, { dia_semana: 5, aberto: true, hora_inicio: '09:00', hora_fim: '18:00' },
    { dia_semana: 6, aberto: true, hora_inicio: '09:00', hora_fim: '18:00' },
  ], admin);
  ok('salvar funcionamento → 200', r.status === 200);
  r = await req('PUT', `/api/profissionais/${profId}`, { nome: 'Prof Teste', horarios: [{ dia_semana: 1, hora_inicio: '08:00', hora_fim: '17:00' }], servicoIds: [servicoId] }, admin);
  ok('vincular serviço ao profissional → 200', r.status === 200);

  r = await req('POST', '/api/clientes', { nome: 'Cliente Teste', telefone: '11999990000', email: 'cliente@teste.local' }, admin);
  ok('criar cliente → 201', r.status === 201);
  const clienteId = r.dados.id;

  r = await req('POST', '/api/salas', { nome: 'Sala Teste' }, admin);
  const salaId = r.dados.id;
  ok('criar sala → 201', r.status === 201);

  // próxima segunda-feira
  const amanha = new Date(); amanha.setDate(amanha.getDate() + ((8 - amanha.getDay()) % 7 || 7));
  const seg = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;

  console.log('\n== Disponibilidade ==');
  r = await req('GET', `/api/disponibilidade?profissional_id=${profId}&servico_id=${servicoId}&data=${seg}`, undefined, admin);
  ok('slots gerados na segunda (08:00–17:00, 45min+5)', r.status === 200 && r.dados.slots.length > 0, JSON.stringify(r.dados).slice(0, 120));
  ok('primeiro slot 08:00', r.dados.slots?.[0] === '08:00');
  ok('sem slot que estoure o turno', !r.dados.slots?.includes('16:30'));

  console.log('\n== Agendamentos ==');
  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '08:00' }, admin);
  ok('criar agendamento → 201', r.status === 201, JSON.stringify(r.dados));
  const agId = r.dados.id;
  r = await req('GET', '/api/agendamentos?de=' + seg + '&ate=' + seg, undefined, admin);
  const ag = r.dados.find((a) => a.id === agId);
  ok('hora_fim calculada = 08:50 (45+5)', ag && ag.hora_fim === '08:50', ag && ag.hora_fim);

  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '08:00' }, admin);
  ok('duplicidade exata → 409', r.status === 409);
  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '08:20' }, admin);
  ok('conflito de horário do profissional → 409', r.status === 409, JSON.stringify(r.dados));
  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '09:00' }, admin);
  ok('slot seguinte livre → 201', r.status === 201, JSON.stringify(r.dados));

  // conflito de sala
  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '10:00', sala_id: salaId }, admin);
  ok('agendar com sala → 201', r.status === 201, JSON.stringify(r.dados));
  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '10:30', sala_id: salaId }, admin);
  ok('conflito de sala → 409', r.status === 409, JSON.stringify(r.dados));

  // ciclo de vida
  r = await req('POST', `/api/agendamentos/${agId}/status`, { status: 'confirmado' }, admin);
  ok('pendente → confirmado', r.status === 200);
  r = await req('POST', `/api/agendamentos/${agId}/status`, { status: 'pendente' }, admin);
  ok('confirmado → pendente inválido → 409', r.status === 409);
  r = await req('POST', `/api/agendamentos/${agId}/status`, { status: 'em_atendimento' }, admin);
  ok('confirmado → em_atendimento', r.status === 200);
  r = await req('POST', `/api/agendamentos/${agId}/status`, { status: 'finalizado' }, admin);
  ok('em_atendimento → finalizado', r.status === 200);
  r = await req('PUT', `/api/agendamentos/${agId}`, { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '09:00' }, admin);
  ok('finalizado não pode ser editado → 409', r.status === 409);

  // bloqueio
  r = await req('POST', '/api/bloqueios', { data_inicio: seg, data_fim: seg, motivo: 'Teste bloqueio' }, admin);
  ok('criar bloqueio geral → 201', r.status === 201);
  const bloqueioId = r.dados.id;
  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '11:00' }, admin);
  ok('agendamento em dia bloqueado → 409', r.status === 409, JSON.stringify(r.dados));
  r = await req('DELETE', `/api/bloqueios/${bloqueioId}`, undefined, admin);
  ok('remover bloqueio → 200', r.status === 200);

  // edição/remarcação
  r = await req('POST', '/api/agendamentos', { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '11:00' }, admin);
  const ag2 = r.dados.id;
  r = await req('PUT', `/api/agendamentos/${ag2}`, { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '11:30' }, admin);
  ok('remarcação para slot livre → 200', r.status === 200, JSON.stringify(r.dados));
  r = await req('PUT', `/api/agendamentos/${ag2}`, { cliente_id: clienteId, profissional_id: profId, servico_id: servicoId, data: seg, hora_inicio: '08:30' }, admin);
  ok('remarcação para slot ocupado → 409', r.status === 409);
  r = await req('DELETE', `/api/agendamentos/${ag2}`, undefined, admin);
  ok('excluir agendamento → 200', r.status === 200);

  // profissional só vê a própria agenda
  r = await req('POST', '/api/login', { email: 'prof1@demo.local', senha: 'prof123' });
  const profTok = r.dados.token;
  r = await req('GET', '/api/agendamentos', undefined, profTok);
  ok('profissional vê apenas a própria agenda', r.status === 200 && r.dados.every((a) => a.profissional_id === r.dados[0].profissional_id));

  console.log('\n== Agendamento online (Pix manual) ==');
  r = await req('GET', '/api/publico/servicos');
  ok('serviços públicos sem auth', r.status === 200 && r.dados.length > 0);
  r = await req('GET', `/api/publico/slots?servico_id=${servicoId}&data=${seg}`);
  ok('slots públicos sem auth', r.status === 200 && r.dados.resultados.length > 0);
  const slotsLivres = r.dados.resultados[0].slots;
  const slotLivre = slotsLivres[0];
  const profPub = r.dados.resultados[0].profissional.id;
  r = await req('POST', '/api/publico/agendar', { servico_id: servicoId, profissional_id: profPub, data: seg, hora_inicio: slotLivre, cliente: { nome: 'Cliente Online', telefone: '11888887777' }, aceitou_regras: true });
  ok('checkout Pix manual cria QR e sinal de 50%', r.status === 201 && r.dados.pagamento.valorSinalCentavos === 5000 && r.dados.pagamento.pixCopiaECola.includes('20458502000178') && r.dados.pagamento.pixQrDataUri.startsWith('data:image/svg+xml;base64,') && r.dados.token);
  const agOnline = r.dados.id;
  const pixOnline = r.dados.pagamento;
  const tokenCheckout = r.dados.token;
  const brcode = require('./pagamentos/pix-brcode');
  ok('BR Code contém CRC válido', pixOnline.pixCopiaECola.slice(-4) === brcode.crc16(pixOnline.pixCopiaECola.slice(0, -4)));
  r = await req('POST', `/api/agendamentos/${agOnline}/status`, { status: 'confirmado' }, admin);
  ok('não confirma agendamento sem conferência Pix', r.status === 409);
  r = await req('POST', `/api/publico/agendamentos/${agOnline}/pagamento/informar?token=${tokenCheckout}`, {});
  ok('cliente avisa que fez o Pix', r.status === 200 && r.dados.clienteInformou);
  r = await req('GET', '/api/notificacoes/agendamentos-pendentes', undefined, admin);
  ok('pedido com Pix informado aparece para o administrador', r.status === 200 && r.dados.some((x) => x.tipo === 'agendamento' && x.id === agOnline));
  r = await req('POST', `/api/agendamentos/${agOnline}/status`, { status: 'confirmado' }, gestor);
  ok('somente o administrador confere o Pix', r.status === 403);
  r = await req('POST', `/api/agendamentos/${agOnline}/status`, { status: 'confirmado' }, admin);
  ok('admin confere manualmente e confirma o agendamento', r.status === 200);
  r = await req('GET', `/api/publico/agendamentos/${agOnline}/pagamento?token=${tokenCheckout}`);
  ok('checkout recebe estado confirmado pelo estabelecimento', r.status === 200 && r.dados.status === 'pago');
  r = await req('POST', '/api/publico/agendar', { servico_id: servicoId, profissional_id: profPub, data: seg, hora_inicio: slotLivre, cliente: { nome: 'Cliente Online 2', telefone: '11888886666' }, aceitou_regras: true });
  ok('mesmo slot público → 409', r.status === 409);

  const slotsParaCancelar = await req('GET', '/api/publico/slots?servico_id=' + servicoId + '&data=' + seg);
  const slotParaCancelar = slotsParaCancelar.dados.resultados[0].slots.find((x) => x !== slotLivre);
  r = await req('POST', '/api/publico/agendar', { servico_id: servicoId, profissional_id: profPub, data: seg, hora_inicio: slotParaCancelar, cliente: { nome: 'Cliente Cancelamento', telefone: '11888885555' }, aceitou_regras: true });
  const agCancelamentoAdmin = r.dados.id;
  r = await req('POST', `/api/publico/agendamentos/${agCancelamentoAdmin}/pagamento/informar?token=${r.dados.token}`, {});
  ok('cliente informa pagamento antes do cancelamento administrativo', r.status === 200 && r.dados.clienteInformou);
  r = await req('POST', `/api/agendamentos/${agCancelamentoAdmin}/status`, { status: 'cancelado', pixRecebido: true }, admin);
  ok('cancelar com Pix conferido cria devolucao manual integral', r.status === 200 && r.dados.aviso && r.dados.aviso.includes('R$'));
  r = await req('GET', '/api/notificacoes/agendamentos-pendentes', undefined, admin);
  ok('devolucao integral da clinica entra na fila pelo sinal', r.status === 200 && r.dados.some((x) => x.tipo === 'reembolso' && x.agendamento_id === agCancelamentoAdmin && x.valor_sinal_centavos === 5000));

  const dataPortalDate = new Date(seg + 'T12:00:00');
  dataPortalDate.setDate(dataPortalDate.getDate() + 7);
  const dataPortal = [dataPortalDate.getFullYear(), String(dataPortalDate.getMonth() + 1).padStart(2, '0'), String(dataPortalDate.getDate()).padStart(2, '0')].join('-');
  r = await req('GET', '/api/publico/slots?servico_id=' + servicoId + '&data=' + dataPortal);
  const slotPortal = r.dados.resultados[0].slots[0];
  const profPortal = r.dados.resultados[0].profissional.id;
  r = await req('POST', '/api/publico/agendar', { servico_id: servicoId, profissional_id: profPortal, data: dataPortal, hora_inicio: slotPortal, cliente: { nome: 'Nome ignorado', telefone: '11999998888' }, aceitou_regras: true }, clientePortal);
  ok('cliente autenticado inicia checkout Pix manual → 201', r.status === 201 && r.dados.pagamento && r.dados.token);
  const agPortal = r.dados.id;
  const pixPortal = r.dados.pagamento;
  const tokenPortal = r.dados.token;
  r = await req('GET', '/api/cliente/agendamentos', undefined, clientePortal);
  ok('cliente vê somente a própria agenda e o sinal', r.status === 200 && r.dados.length === 1 && r.dados.some((x) => x.id === agPortal && x.valor_sinal_centavos === 5000));
  r = await req('POST', `/api/publico/agendamentos/${agPortal}/pagamento/informar?token=${tokenPortal}`, {});
  ok('cliente autenticado informa o Pix', r.status === 200 && r.dados.clienteInformou);
  r = await req('POST', `/api/agendamentos/${agPortal}/status`, { status: 'confirmado' }, admin);
  ok('admin confirma manualmente o pagamento do portal', r.status === 200);
  const inicioProximo = new Date(Date.now() + 90 * 60 * 1000);
  const partesDataSP = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(inicioProximo).map((x) => [x.type, x.value]));
  const dataProximaSP = partesDataSP.year + '-' + partesDataSP.month + '-' + partesDataSP.day;
  const horaProximaSP = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(inicioProximo);
  dbTeste.prepare('UPDATE agendamentos SET data=?, hora_inicio=? WHERE id=?').run(dataProximaSP, horaProximaSP, agPortal);
  r = await req('POST', '/api/cliente/agendamentos/' + agPortal + '/cancelar', {}, clientePortal);
  ok('cancelamento com menos de 2h calcula retenção de 20% e devolução manual', r.status === 200 && r.dados.retidoCentavos === 2000 && r.dados.reembolsoCentavos === 3000 && r.dados.statusReembolso === 'manual_pendente', JSON.stringify(r.dados));
  r = await req('GET', '/api/notificacoes/agendamentos-pendentes', undefined, admin);
  const alertaDevolucao = r.dados.find((x) => x.tipo === 'reembolso' && x.agendamento_id === agPortal);
  ok('devolução manual fica na fila com valor calculado', Boolean(alertaDevolucao) && alertaDevolucao.valor_sinal_centavos === 3000);
  r = await req('POST', `/api/pagamentos/devolucoes/${alertaDevolucao.id}/confirmar`, {}, admin);
  ok('admin registra devolução feita no banco', r.status === 200 && r.dados.status === 'reembolso_parcial');
  r = await req('GET', '/api/cliente/agendamentos', undefined, clientePortal);
  ok('cancelamento e devolução parcial aparecem no histórico', r.status === 200 && r.dados.some((x) => x.id === agPortal && x.status === 'cancelado' && x.pagamento_status === 'reembolso_parcial'));  r = await req('GET', '/api/clientes', undefined, admin);
  ok('cadastro interno não expõe hashes de senha', r.status === 200 && r.dados.every((c) => !('senha_hash' in c)));
  r = await req('GET', '/api/dashboard', undefined, admin);
  ok('dashboard reflete agendamentos online', r.status === 200);

  console.log('\n== Clube de Assinaturas ==');
  r = await req('GET', '/api/clube/planos', undefined, admin);
  const nomesPlanos = r.dados.map((p) => p.nome);
  ok('seed cria planos Beauty com serviços do catálogo (pendências registradas p/ associação manual)', r.status === 200 && nomesPlanos.includes('Beauty Essential') && nomesPlanos.includes('Beauty Premium') && dbTeste.prepare("SELECT COUNT(*) AS n FROM subscription_audit_logs WHERE acao = 'seed_pendencia'").get().n > 0);
  const essencial = r.dados.find((p) => p.nome === 'Beauty Essential');
  ok('plano calcula avulso em centavos e economia coerente', essencial && essencial.mensalidade_centavos === 15000 && essencial.avulso_centavos === essencial.itens.reduce((s, i) => s + i.preco_centavos * i.quantidade, 0) && (essencial.economia_centavos === essencial.avulso_centavos - essencial.mensalidade_centavos || essencial.economia_centavos === null));
  r = await req('GET', '/api/clube/planos', undefined, recep);
  ok('recepcao não acessa o clube → 403', r.status === 403);
  r = await req('POST', '/api/clube/planos', { nome: 'Plano Teste', mensalidade_centavos: 10000, itens: [{ servico_id: 999999, quantidade: 1 }] }, admin);
  ok('plano com serviço inexistente → 400', r.status === 400);
  const servicoQualquer = dbTeste.prepare('SELECT id FROM servicos LIMIT 1').get().id;
  r = await req('POST', '/api/clube/planos', { nome: 'Plano Teste', mensalidade_centavos: 10000, desconto_adicional_pct: 10, itens: [{ servico_id: servicoQualquer, quantidade: 2 }] }, admin);
  ok('criar plano → 201', r.status === 201);
  const planoTeste = r.dados.id;
  r = await req('PUT', `/api/clube/planos/${planoTeste}`, { nome: 'Plano Teste Editado', mensalidade_centavos: 12000, desconto_adicional_pct: 5, itens: [{ servico_id: servicoQualquer, quantidade: 3 }] }, admin);
  ok('editar plano → 200', r.status === 200);
  r = await req('POST', `/api/clube/planos/${planoTeste}`, { ativo: false }, admin);
  ok('desativar plano → 200', r.status === 200 && r.dados.ativo === false);

  r = await req('POST', '/api/clube/assinaturas', { plano_id: essencial.id, cliente_id: 1 }, admin);
  ok('contratar assinatura → 201', r.status === 201);
  const assinaturaId = r.dados.id;
  const ciclo = dbTeste.prepare('SELECT * FROM subscription_cycles WHERE assinatura_id = ?').get(assinaturaId);
  ok('contratação cria ciclo aguardando pagamento com benefícios', ciclo && ciclo.status === 'aguardando_pagamento' && dbTeste.prepare('SELECT COUNT(*) AS n FROM subscription_entitlements WHERE ciclo_id = ?').get(ciclo.id).n > 0);
  r = await req('GET', '/api/clube/assinaturas/' + assinaturaId, undefined, admin);
  ok('assinatura pendente não libera benefício (elegibilidade sem ciclo)', r.status === 200 && r.dados.ciclo.status === 'aguardando_pagamento');
  r = await req('POST', `/api/clube/assinaturas/${ciclo.id}/pagamento`, {}, admin);
  ok('confirmar pagamento ativa ciclo e assinatura', r.status === 200 && dbTeste.prepare("SELECT status FROM subscription_cycles WHERE id = ?").get(ciclo.id).status === 'ativo' && dbTeste.prepare("SELECT status FROM subscriptions WHERE id = ?").get(assinaturaId).status === 'ativa');

  // agendamento interno consome benefício do clube (usa um serviço incluído no plano)
  const servicoClube = dbTeste.prepare('SELECT servico_id FROM subscription_plan_items WHERE plano_id = ? LIMIT 1').get(essencial.id).servico_id;
  const profClube = dbTeste.prepare('SELECT profissional_id AS id FROM servico_profissional WHERE servico_id = ? LIMIT 1').get(servicoClube).id;
  const amanhaClube = new Date(); amanhaClube.setDate(amanhaClube.getDate() + ((8 - amanhaClube.getDay()) % 7 || 7));
  const dataClube = amanhaClube.toISOString().slice(0, 10);
  const slotsClube = await req('GET', `/api/disponibilidade?profissional_id=${profClube}&servico_id=${servicoClube}&data=${dataClube}`, undefined, admin);
  const slotClube = slotsClube.dados?.slots?.[0];
  if (slotClube) {
    r = await req('POST', '/api/agendamentos', { cliente_id: 1, profissional_id: profClube, servico_id: servicoClube, data: dataClube, hora_inicio: slotClube }, admin);
    ok('agendamento reserva benefício do clube', r.status === 201 && r.dados.clube && r.dados.clube.tipo === 'incluido');
    const agClube = r.dados.id;
    const entReservado = dbTeste.prepare('SELECT * FROM subscription_entitlements WHERE ciclo_id = ? AND servico_id = ?').get(ciclo.id, servicoClube);
    ok('reserva temporária registrada (usados inalterados)', entReservado && entReservado.reservados === 1 && entReservado.usados === 0);
    r = await req('POST', `/api/agendamentos/${agClube}/status`, { status: 'confirmado' }, admin);
    r = await req('POST', `/api/agendamentos/${agClube}/status`, { status: 'em_atendimento' }, admin);
    r = await req('POST', `/api/agendamentos/${agClube}/status`, { status: 'finalizado' }, admin);
    const entConsumido = dbTeste.prepare('SELECT * FROM subscription_entitlements WHERE ciclo_id = ? AND servico_id = ?').get(ciclo.id, servicoClube);
    ok('finalização converte reserva em consumo', r.status === 200 && entConsumido && entConsumido.usados === 1 && entConsumido.reservados === 0);
    r = await req('POST', `/api/agendamentos/${agClube}/status`, { status: 'em_atendimento' }, admin);
    ok('finalizado não pode ser revertido por status → 409 (consumo preservado)', r.status === 409);
    // consumo preservado; liberação ocorre quando o agendamento é excluído
    r = await req('DELETE', `/api/agendamentos/${agClube}`, undefined, admin);
    ok('excluir agendamento libera o consumo do benefício', r.status === 200 && dbTeste.prepare('SELECT usados FROM subscription_entitlements WHERE ciclo_id = ? AND servico_id = ?').get(ciclo.id, servicoClube).usados === 0);
    r = await req('GET', `/api/agendamentos/beneficio?cliente_id=1&servico_id=${servicoClube}`, undefined, admin);
    ok('elegibilidade volta a oferecer o benefício após liberação', r.status === 200 && r.dados.tipo === 'incluido' && dbTeste.prepare("SELECT COUNT(*) AS n FROM subscription_usage WHERE cliente_id = 1 AND acao = 'liberado'").get().n > 0);
  } else {
    ok('slots disponíveis para testar consumo do clube', false);
  }

  r = await req('GET', '/api/clube/indicadores', undefined, admin);
  ok('indicadores do clube calculados', r.status === 200 && typeof r.dados.mrr_contratado_centavos === 'number' && typeof r.dados.assinantes_ativos === 'number');
  r = await req('DELETE', `/api/clube/planos/${planoTeste}`, undefined, admin);
  ok('excluir plano sem assinantes → 200', r.status === 200);

  // área do cliente
  r = await req('POST', '/api/cliente/registrar', { nome: 'Assinante Clube', email: 'clube@teste.local', telefone: '11977776666', senha: 'clube12345' });
  const tokenClube = r.dados.token;
  const clienteClubeId = dbTeste.prepare('SELECT id FROM clientes WHERE email = ?').get('clube@teste.local').id;
  r = await req('GET', '/api/cliente/clube', undefined, tokenClube);
  ok('cliente vê planos ativos e sem assinatura', r.status === 200 && r.dados.planos.length >= 1 && r.dados.assinatura === null);
  r = await req('POST', '/api/cliente/clube/contratar', { plano_id: essencial.id }, tokenClube);
  ok('cliente contrata plano → 201 pendente', r.status === 201);
  r = await req('POST', '/api/cliente/clube/contratar', { plano_id: essencial.id }, tokenClube);
  ok('contratação duplicada → 409', r.status === 409);
  r = await req('POST', '/api/cliente/clube/cancelar', { assinatura_id: dbTeste.prepare('SELECT id FROM subscriptions WHERE cliente_id = ?').get(clienteClubeId).id }, tokenClube);
  ok('cliente cancela assinatura pendente', r.status === 200);

  console.log('\n== Notificações ==');
  r = await req('GET', '/api/notificacoes', undefined, admin);
  ok('notificações registradas (status desabilitada)', r.status === 200 && r.dados.length > 0 && r.dados.every((n) => n.status === 'desabilitada'));
  console.log('\n== Limpeza segura dos dados de demonstração ==');
  r = await req('GET', '/api/funcionamento', undefined, admin);
  const diasAbertosAntesLimpeza = r.dados.filter((d) => d.aberto).length;
  r = await req('GET', '/api/admin/dados-iniciais', undefined, admin);
  ok('admin vê prévia dos dados iniciais', r.status === 200 && r.dados.contagens.servicos > 0);
  r = await req('GET', '/api/admin/dados-iniciais', undefined, gestor);
  ok('gestor não pode limpar dados iniciais → 403', r.status === 403);
  r = await req('POST', '/api/admin/dados-iniciais/limpar', { senha: 'admin123', confirmacao: 'errado' }, admin);
  ok('limpeza exige frase explícita → 400', r.status === 400);
  r = await req('POST', '/api/admin/dados-iniciais/limpar', { senha: 'incorreta', confirmacao: 'LIMPAR DADOS DE DEMONSTRACAO' }, admin);
  ok('limpeza exige senha atual → 401', r.status === 401);
  r = await req('POST', '/api/admin/dados-iniciais/limpar', { senha: 'admin123', confirmacao: 'LIMPAR DADOS DE DEMONSTRACAO' }, admin);
  ok('admin limpa demonstração e preserva a própria conta', r.status === 200 && r.dados.administradorPreservado && r.dados.apagados.servicos > 0);
  r = await req('GET', '/api/funcionamento', undefined, admin);
  ok('horários de funcionamento da clínica são preservados', r.status === 200 && r.dados.filter((d) => d.aberto).length === diasAbertosAntesLimpeza);
  r = await req('GET', '/api/dashboard', undefined, admin);
  ok('dados reais e sessão administrativa permanecem ativos após limpeza', r.status === 200);

  console.log(`\n===== RESULTADO: ${testes - falhas}/${testes} testes passaram, ${falhas} falhas =====`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO NOS TESTES:', e); process.exit(2); });
