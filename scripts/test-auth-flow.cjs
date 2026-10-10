// Executes the actual auth store with a stubbed server; never contacts production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
let mode = 'pending', fail = false, signupOptions, resendOptions;
const session = { user: { id: 'new-auth-user' } };
const auth = {
  getSession: async () => { if (fail) throw new Error('offline'); return { data: { session: null }, error: null }; },
  signUp: async (input) => { signupOptions = input; if (fail) throw new Error('offline'); return { data: { user: session.user, session: mode === 'session' ? session : null }, error: null }; },
  signInWithPassword: async () => { if (fail) throw new Error('offline'); return mode === 'pending' ? { data: { session: null }, error: { code: 'email_not_confirmed' } } : { data: { session }, error: null }; },
  resend: async (input) => { resendOptions = input; return { error: mode === 'limited' ? { code: 'over_email_send_rate_limit' } : null }; },
  signOut: async () => {},
};
const mocks = new Map([
  [path.resolve('src/lib/supabase.ts'), { isMockMode: false, supabase: { auth } }],
  [path.resolve('src/lib/authRedirect.ts'), { getAuthRedirectUrl: () => 'pelada://auth/callback' }],
]);
const resolve = Module._resolveFilename, load = Module._load;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.resolve('src', name.slice(2)) : name, parent, ...rest);
};
Module._load = function(name, parent, ...rest) {
  if (name === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
  const file = Module._resolveFilename(name, parent);
  return mocks.has(file) ? mocks.get(file) : load.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { parseAuthCallback, authErrorMessage } = require('../src/lib/authCallback.ts');
const { useAuthStore: store } = require('../src/store/useAuthStore.ts');
async function run() {
  const profile = { name: 'Novo', phone: null, preferredPosition: 'line', favoriteSports: ['volei'] };
  assert.equal(await store.getState().register(' new@test.invalid ', 'test-password', profile), true);
  assert.equal(signupOptions.options.emailRedirectTo, 'pelada://auth/callback');
  assert.equal(signupOptions.email, 'new@test.invalid');
  assert.equal(signupOptions.options.data.favorite_sports[0], 'volei');
  assert.equal(store.getState().pendingEmail, 'new@test.invalid');
  assert.equal(store.getState().isLoggedIn, false); // Creating a user is not authentication.
  assert.equal(store.getState().authUserId, null);
  assert.equal(await store.getState().login('new@test.invalid', 'password'), false);
  assert.match(store.getState().error, /Confirme seu e-mail/);
  assert.equal(await store.getState().resendConfirmation('new@test.invalid'), true);
  assert.equal(resendOptions.type, 'signup');
  assert.equal(resendOptions.options.emailRedirectTo, 'pelada://auth/callback');
  mode = 'limited';
  assert.equal(await store.getState().resendConfirmation('new@test.invalid'), false);
  assert.match(store.getState().error, /limite/);
  mode = 'session';
  assert.equal(await store.getState().login('new@test.invalid', 'password'), true);
  assert.equal(store.getState().authUserId, 'new-auth-user');
  assert.equal(store.getState().pendingEmail, null);
  store.getState().setSession(null); assert.equal(store.getState().isLoggedIn, false);
  store.getState().setSession(session); assert.equal(store.getState().isLoggedIn, true);
  await store.getState().logout(); assert.equal(store.getState().authUserId, null);
  fail = true;
  assert.equal(await store.getState().register('new@test.invalid', 'password'), false);
  assert.equal(store.getState().loading, false);
  assert.equal(await store.getState().login('new@test.invalid', 'password'), false);
  assert.equal(store.getState().loading, false);
  await store.getState().initialize();
  assert.equal(store.getState().authReady, true); assert.equal(store.getState().authUserId, null);
  for (const url of ['pelada://auth/callback#access_token=test&refresh_token=refresh', 'pelada:///auth/callback#access_token=test&refresh_token=refresh', 'https://app.example/auth/callback#access_token=test&refresh_token=refresh']) {
    assert.deepEqual(parseAuthCallback(url), { kind: 'tokens', accessToken: 'test', refreshToken: 'refresh' });
  }
  assert.equal(parseAuthCallback('pelada://auth/callback?code=test').kind, 'code');
  assert.equal(parseAuthCallback('pelada://auth/callback#error_code=otp_expired&error=access_denied').kind, 'error');
  for (const url of ['bad-url', 'pelada://time/test#access_token=x&refresh_token=y', 'evil://auth/callback#access_token=x&refresh_token=y', 'pelada://auth/callback#access_token=x']) assert.equal(parseAuthCallback(url).kind, 'empty');
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /incorretos/);
  assert(!authErrorMessage(new Error('sensitive-token')).includes('sensitive-token'));
  console.log('PASS: pending signup != login, mobile redirect, metadata, resend/rate limit, session events, offline/loading recovery, callback tokens/code/expired/wrong-path, no secret echo.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
