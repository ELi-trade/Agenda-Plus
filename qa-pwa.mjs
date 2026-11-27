export default async function run(page, ui) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector('#form-auth input[name="email"]', { timeout: 60000 });
  const sw = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL);
  });
  await page.screenshot({ path: 'qa-login-mobile.png' });

  // Login via API direta + definir sessão no app
  const logado = await page.evaluate(async () => {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.local', senha: 'admin123' })
    });
    const j = await r.json();
    if (!j.token) return false;
    localStorage.setItem('ag_token', j.token);
    sessionStorage.setItem('usuario', JSON.stringify(j.usuario));
    location.hash = '#/dashboard';
    location.reload();
    return true;
  });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'qa-dash-mobile.png' });
  const estado = await page.evaluate(() => ({
    hash: location.hash, btnMenu: !!document.querySelector('#btn-menu'), body: document.body.className
  }));

  const btn = await page.$('#btn-menu');
  let menuOk = false;
  if (btn) {
    await btn.click();
    await page.waitForTimeout(500);
    menuOk = await page.evaluate(() => document.body.classList.contains('menu-aberto'));
    await page.screenshot({ path: 'qa-menu-mobile.png' });
    await page.evaluate(() => { document.querySelector('#sidebar nav a[href="#/agenda"]').click(); });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'qa-agenda-mobile.png' });
  }

  const manifest = await page.evaluate(async () => {
    const r = await fetch('/manifest.webmanifest');
    const j = await r.json();
    const icon = await fetch(j.icons[0].src);
    return { ok: r.ok, nome: j.name, iconOk: icon.ok };
  });

  return { serviceWorker: sw, logado, estado, drawerAbriu: menuOk, manifest };
}
