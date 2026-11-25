const TOKEN_CHAVE = 'ag_token';
const TOKEN_CLIENTE = 'ag_cliente_token';

function token() { return localStorage.getItem(TOKEN_CHAVE); }
function tokenCliente() { return localStorage.getItem(TOKEN_CLIENTE); }
function setToken(t) { t ? localStorage.setItem(TOKEN_CHAVE, t) : localStorage.removeItem(TOKEN_CHAVE); }
function setClientToken(t) { t ? localStorage.setItem(TOKEN_CLIENTE, t) : localStorage.removeItem(TOKEN_CLIENTE); }

async function req(metodo, caminho, corpo, modo = 'equipe') {
  const opts = { method: metodo, headers: { 'Content-Type': 'application/json' } };
  const t = modo === 'cliente' ? tokenCliente() : token();
  if (t) opts.headers['Authorization'] = 'Bearer ' + t;
  if (corpo !== undefined) opts.body = JSON.stringify(corpo);
  const resp = await fetch(caminho, opts);
  let dados = null;
  try { dados = await resp.json(); } catch { }
  if (!resp.ok) {
    const msg = (dados && dados.erro) || 'Erro ' + resp.status;
    if (resp.status === 401 && !caminho.includes('/login')) {
      if (modo === 'cliente') {
        setClientToken(null);
        sessionStorage.removeItem('cliente');
        location.hash = '#/login';
      } else {
        setToken(null);
        sessionStorage.removeItem('usuario');
        location.hash = '#/login';
      }
    }
    throw new Error(msg);
  }
  return dados;
}

const api = {
  get: (c) => req('GET', c),
  post: (c, b) => req('POST', c, b),
  put: (c, b) => req('PUT', c, b),
  del: (c) => req('DELETE', c),
};
export const get = api.get, post = api.post, put = api.put, del = api.del;
export const getCliente = (c) => req('GET', c, undefined, 'cliente');
export const postCliente = (c, b) => req('POST', c, b, 'cliente');
export const postPublico = (c, b) => req('POST', c, b, 'cliente');
export { setToken, setClientToken };
export default api;

// ---------- UI ----------
export const UI = {
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  toast(msg, tipo = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + (tipo === 'sucesso' ? 'sucesso' : tipo === 'erro' ? 'erro' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  },
  modal(html) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = '<div class="modal">' + html + '</div>';
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fundo.remove(); });
    document.body.appendChild(fundo);
    return fundo;
  },
};