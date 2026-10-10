// Auth responses are intercepted. Does not create accounts or send real emails.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_URL || 'http://localhost:19014';
const out = path.resolve('.test-runtime/auth-ui');
const id = '00000000-0000-4000-8000-000000000123';
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'validation@example.invalid', app_metadata: {}, user_metadata: { name: 'Validação' }, identities: [], created_at: new Date().toISOString() };
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.${Buffer.from('test-only-signature').toString('base64url')}`;
const session = { access_token: token, refresh_token: 'test-only-refresh', token_type: 'bearer', expires_in: 3600, user };
async function run() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  fs.mkdirSync(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [], signups = [], authRequests = [];
  let resends = 0, allowLogin = false, allowCode = false;
  const verifications = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.routeWebSocket(/supabase\.co/, ws => ws.close());
  await context.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/auth/')) authRequests.push(url.pathname);
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' };
    if (url.pathname.endsWith('/rpc/growth_snapshot')) return route.fulfill({ status: 200, headers, json: { venues: [], buddies: [], slots: [], windows: [], requests: [], onboarding: null } });
    if (url.pathname.endsWith('/rpc/commercial_access_snapshot')) return route.fulfill({ status: 200, headers, json: { role: null, licenses: [], agreements: [] } });
    if (url.pathname.endsWith('/platform_configuration')) return route.fulfill({ status: 200, headers, json: { settings: { discoveryEnabled: true, referralsEnabled: true, sponsoredEnabled: false, bookingCommissionPercent: 0, whatsappMonthlyAllowance: 100, trialDays: 14 } } });
    if (url.pathname.endsWith('/signup')) { signups.push(url.searchParams.get('redirect_to')); return route.fulfill({ status: 200, headers, json: user }); }
    if (url.pathname.endsWith('/resend')) { resends++; return route.fulfill({ status: 200, headers, json: {} }); }
    if (url.pathname.endsWith('/verify')) { verifications.push(route.request().postDataJSON()); return route.fulfill({ status: allowCode ? 200 : 403, headers, json: allowCode ? session : { code: 'otp_expired', msg: 'Token has expired or is invalid' } }); }
    if (url.pathname.endsWith('/token')) return route.fulfill({ status: allowLogin ? 200 : 400, headers, json: allowLogin ? session : { code: 'email_not_confirmed', msg: 'Email not confirmed' } });
    if (url.pathname.endsWith('/user')) return route.fulfill({ status: 200, headers, json: user });
    return route.fulfill({ status: 200, headers, json: [] });
  });
  const go = route => page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
  const savedAuth = () => page.evaluate(() => JSON.parse(localStorage.getItem('pelada-auth-storage')).state);
  try {
    await go('/cadastro');
    await page.getByPlaceholder('Seu nome', { exact: true }).fill('Validação');
    await page.getByPlaceholder('voce@email.com', { exact: true }).fill('validation@example.invalid');
    await page.getByPlaceholder('Mínimo de 6 caracteres').fill('test-password');
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await page.getByText('Confira seu e-mail', { exact: true }).waitFor();
    assert(page.url().endsWith('/confirmar-email'));
    assert.equal((await savedAuth()).isLoggedIn, false);
    assert.equal(signups.length, 1); assert.equal(signups[0], base + '/auth/callback');
    assert.equal(await page.getByPlaceholder('Mínimo de 6 caracteres').count(), 0);
    await page.screenshot({ path: path.join(out, '01-confirmar-email.png'), fullPage: true });
    await page.getByRole('button', { name: 'Já confirmei — entrar', exact: true }).click();
    await page.getByPlaceholder('voce@email.com').waitFor();
    assert.equal(await page.getByPlaceholder('voce@email.com').inputValue(), 'validation@example.invalid');
    await page.getByPlaceholder('••••••••').fill('test-password');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByText(/Confirme seu e-mail antes de entrar/).waitFor();
    await page.getByRole('button', { name: 'Preciso confirmar meu e-mail' }).click();
    await page.getByText('Confira seu e-mail', { exact: true }).waitFor();
    await page.clock.install(); await page.clock.fastForward(61000);
    await page.getByRole('button', { name: 'Reenviar confirmação', exact: true }).click();
    await page.getByText(/uma nova confirmação foi enviada/).waitFor();
    assert.equal(resends, 1);
    await page.screenshot({ path: path.join(out, '02-reenvio.png'), fullPage: true });
    await page.clock.resume(); // Navegação/RAF volta ao relógio normal após testar o cooldown.
    await page.getByRole('button', { name: 'Meu e-mail tem um código', exact: true }).click();
    await page.getByLabel('Código de confirmação', { exact: true }).fill('12345678');
    await page.getByRole('button', { name: 'Confirmar e entrar', exact: true }).click();
    await page.getByText(/Código ou link inválido/).last().waitFor();
    assert.equal((await savedAuth()).isLoggedIn, false);
    await page.screenshot({ path: path.join(out, '04-codigo-invalido.png'), fullPage: true });
    allowCode = true;
    await page.getByLabel('Código de confirmação', { exact: true }).fill('87654321');
    await page.getByRole('button', { name: 'Confirmar e entrar', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
    assert.equal((await savedAuth()).isLoggedIn, true);
    assert.equal(verifications[1].type, 'email'); assert.equal(verifications[1].email, 'validation@example.invalid');
    assert.equal(verifications[1].token, '87654321');
    assert(!JSON.stringify(await savedAuth()).includes('87654321'));
    await page.evaluate(() => localStorage.clear());
    await go('/confirmar-email');
    await page.getByRole('button', { name: 'O link não abriu? Confirmar no app', exact: true }).click();
    const hash = 'a'.repeat(64);
    await page.getByLabel('Link de confirmação', { exact: true }).fill(`https://oyhbmbstsiagwljatawq.supabase.co/auth/v1/verify?token=${hash}&type=signup&redirect_to=http://localhost:3000`);
    await page.getByRole('button', { name: 'Confirmar e entrar', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
    assert.equal(verifications[2].token_hash, hash);
    assert.equal((await savedAuth()).isLoggedIn, true);
    assert(!JSON.stringify(await savedAuth()).includes(hash));
    await page.evaluate(() => localStorage.clear());
    await go('/auth/callback#error=access_denied&error_code=otp_expired');
    await page.getByText(/Este link expirou/).waitFor();
    await page.waitForURL(url => !url.hash);
    await page.screenshot({ path: path.join(out, '03-link-expirado.png'), fullPage: true });
    await go(`/auth/callback#access_token=${token}&refresh_token=test-only-refresh`);
    await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
    assert.equal((await savedAuth()).isLoggedIn, true);
    assert.equal((await savedAuth()).authUserId, id);
    assert(!page.url().includes('access_token'));
    await page.evaluate(() => localStorage.clear());
    await go(`/auth/callback#access_token=${token}&refresh_token=test-only-refresh`);
    await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
    assert.equal((await savedAuth()).isLoggedIn, true); // Cold start directly on the confirmation route.
    await page.evaluate(() => localStorage.clear());
    await go('/login'); allowLogin = true;
    await page.getByPlaceholder('voce@email.com').fill('validation@example.invalid');
    await page.getByPlaceholder('••••••••').fill('test-password');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
    assert.equal((await savedAuth()).isLoggedIn, true);
    assert.deepEqual(errors, []);
    // Email layout uses static test placeholders, never a real user/token.
    const emailPage = await context.newPage();
    const html = fs.readFileSync(path.resolve('config/mobile-auth/confirmation.html'), 'utf8').replace('{{ .Token }}', '12345678').replace('{{ .ConfirmationURL }}', 'https://example.invalid/verify');
    await emailPage.setContent(html);
    assert.equal(await emailPage.locator('a').getAttribute('href'), 'https://example.invalid/verify');
    assert(await emailPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await emailPage.screenshot({ path: path.join(out, '05-email-borajogo.png'), fullPage: true });
    await emailPage.close();
    console.log('PASS: signup, pending login, resend/cooldown, invalid/valid OTP + home, no stored code, expired/warm/cold callback, password login, mobile email template. All backend responses stubbed.');
  } catch (e) {
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
    console.log({ pathname: new URL(page.url()).pathname, body: (await page.locator('body').innerText()).slice(0, 2000), auth: await savedAuth(), authRequests });
    throw e;
  }
  finally { await browser.close(); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
