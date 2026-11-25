export default async function run(page, ui) {
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.fill('input[name=email]', 'admin@demo.local');
  await page.fill('input[name=senha]', 'admin123');
  await page.click('#form-auth button');
  await page.waitForTimeout(2000);
  const resp = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', senha: 'admin123' }) });
      const d = await r.json();
      return { status: r.status, temToken: !!d.token };
    } catch (e) { return { erro: e.message }; }
  });
  return { url: page.url(), resp, logs: logs.slice(0, 10) };
}
