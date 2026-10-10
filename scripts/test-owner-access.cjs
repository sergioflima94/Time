// Tests the real access store with Auth/RPC stubs; never contacts production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const auth = { authReady: true, isLoggedIn: true, authUserId: 'owner-id' };
const app = { currentPlayerId: 'p1' };
let rpcRole = 'owner', rpcError = null, deferred = null;
const mocks = new Map([
  [path.resolve('src/store/useAuthStore.ts'), { useAuthStore: { getState: () => auth } }],
  [path.resolve('src/store/useAppStore.ts'), { useAppStore: { getState: () => app } }],
  [path.resolve('src/lib/supabase.ts'), { isMockMode: false, supabase: {
    rpc: async name => {
      assert.equal(name,'platform_admin_role');
      if (deferred) return deferred;
      return { data: rpcRole, error: rpcError };
    },
  } }],
]);
const resolve = Module._resolveFilename, load = Module._load;
Module._resolveFilename = function(name,parent,...rest) {
  return resolve.call(this,name.startsWith('@/') ? path.resolve('src',name.slice(2)) : name,parent,...rest);
};
Module._load = function(name,parent,...rest) {
  const file = Module._resolveFilename(name,parent);
  return mocks.has(file) ? mocks.get(file) : load.call(this,name,parent,...rest);
};
require.extensions['.ts'] = (module,file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText,file);
const { usePlatformAccessStore: store, platformAccessKey } = require('../src/store/usePlatformAccessStore.ts');
const { hasOwnerBenefits } = require('../src/lib/featureAccess.ts');
async function run() {
  await store.getState().refresh();
  assert(hasOwnerBenefits(store.getState().role));
  assert.equal(store.getState().accessFor,'owner-id');
  rpcRole = null;
  await store.getState().refresh();
  assert(!hasOwnerBenefits(store.getState().role)); // Revoked on the server.
  for (const role of ['admin','support']) {
    rpcRole = role;
    await store.getState().refresh();
    assert(!hasOwnerBenefits(store.getState().role));
  }
  rpcRole = 'owner';
  await store.getState().refresh();
  rpcError = new Error('Offline');
  await store.getState().refresh();
  assert.equal(store.getState().role,null);
  rpcError = null;
  let complete;
  deferred = new Promise(resolve => { complete = resolve; });
  const oldRequest = store.getState().refresh();
  auth.authUserId = 'other-user';
  store.getState().reset();
  complete({ data: 'owner', error: null });
  await oldRequest;
  assert.equal(store.getState().role,null); // Old request cannot restore privileges.
  assert.notEqual(store.getState().accessFor,platformAccessKey());
  deferred = null; rpcRole = null;
  await store.getState().refresh();
  assert.equal(store.getState().role,null);
  auth.isLoggedIn = false;
  await store.getState().refresh();
  assert.equal(store.getState().accessFor,null);
  auth.isLoggedIn = true; auth.authReady = false;
  assert.equal(platformAccessKey(),null); // Persisted Auth flags aren't verified login.
  console.log('PASS: owner exemption, role revocation, admin/support denial, fail-closed offline, stale response rejection, account switch and logout.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
