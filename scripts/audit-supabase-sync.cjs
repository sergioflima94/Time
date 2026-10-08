const fs = require('fs');
const ts = require('typescript');

const typeFiles = ['src/types/index.ts', 'src/types/growth.ts', 'src/types/pro.ts'];
const interfaces = new Map();
for (const file of typeFiles) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  source.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node)) {
      interfaces.set(node.name.text, node.members
        .filter(ts.isPropertySignature)
        .map((member) => member.name?.getText(source).replace(/['"]/g, ''))
        .filter(Boolean));
    }
  });
}

const storeFiles = [
  ['app', 'src/store/useAppStore.ts', 'AppState'],
  ['growth', 'src/store/useGrowthStore.ts', 'GrowthState'],
  ['pro', 'src/store/useProStore.ts', 'ProState'],
];
const stateTypes = new Map();
for (const [store, file, interfaceName] of storeFiles) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  source.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== interfaceName) return;
    for (const member of node.members.filter(ts.isPropertySignature)) {
      const key = member.name?.getText(source);
      const text = member.type?.getText(source) ?? '';
      const match = text.match(/^([A-Za-z0-9_]+)\[\]$/);
      if (key && match) stateTypes.set(`${store}:${key}`, match[1]);
    }
  });
}

const mapping = fs.readFileSync('src/lib/supabaseSyncMappings.ts', 'utf8');
const mappings = [];
for (const match of mapping.matchAll(/\b(app|growth|pro)\('([^']+)',\s*'([^']+)'/g)) {
  mappings.push({ store: match[1], stateKey: match[2], table: match[3] });
}
mappings.push(
  { store: 'app', stateKey: 'players', table: 'players' },
  { store: 'app', stateKey: 'peladas', table: 'peladas' },
  { store: 'app', stateKey: 'fields', table: 'fields' },
  { store: 'growth', stateKey: 'scoreboards', table: 'multi_sport_scoreboards' },
  { store: 'growth', stateKey: 'chatChannels', table: 'chat_channels' },
  { store: 'growth', stateKey: 'waivers', table: 'digital_waivers' },
  { store: 'growth', stateKey: 'openSlotOffers', table: 'open_slot_offers' },
  { store: 'pro', stateKey: 'checkInPasses', table: 'game_checkin_passes' },
  { store: 'pro', stateKey: 'subscriptions', table: 'commercial_subscriptions' },
  { store: 'pro', stateKey: 'syncQueue', table: 'client_mutations' },
);
const uniqueMappings = [...new Map(mappings.map((spec) => [`${spec.store}:${spec.stateKey}`, spec])).values()];
const mappedStateKeys = new Set(uniqueMappings.map((spec) => `${spec.store}:${spec.stateKey}`));
const unmappedArrays = [...stateTypes.keys()].filter((key) => !mappedStateKeys.has(key));
if (unmappedArrays.length) {
  console.error(`Store arrays without a Supabase mapping: ${unmappedArrays.join(', ')}`);
  process.exitCode = 1;
}

const generated = fs.readFileSync('src/types/supabase.generated.ts', 'utf8');
const columns = new Map();
const requiredInsertColumns = new Map();
for (const table of [...generated.matchAll(/^      ([a-z_]+): \{/gm)].map((item) => item[1])) {
  const row = generated.match(new RegExp('\\n      ' + table + ': \\{\\r?\\n        Row: \\{([\\s\\S]*?)\\r?\\n        \\}\\r?\\n        Insert:'));
  if (row) columns.set(table, new Set([...row[1].matchAll(/^          ([a-z_]+):/gm)].map((item) => item[1])));
  const insert = generated.match(new RegExp('\\n      ' + table + ': \\{[\\s\\S]*?\\r?\\n        Insert: \\{([\\s\\S]*?)\\r?\\n        \\}\\r?\\n        Update:'));
  if (insert) requiredInsertColumns.set(table, [...insert[1].matchAll(/^          ([a-z_]+)(\??):/gm)].filter((item) => item[2] !== '?').map((item) => item[1]));
}

const snake = (value) => value.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase());
console.log('Special model fields handled by adapters:');
for (const spec of uniqueMappings) {
  const typeName = stateTypes.get(`${spec.store}:${spec.stateKey}`);
  const props = interfaces.get(typeName) ?? [];
  const db = columns.get(spec.table);
  if (!typeName || !db) continue;
  const extras = props.map(snake).filter((property) => !db.has(property));
  if (extras.length) console.log(`${spec.store}.${spec.stateKey} (${typeName}) -> ${spec.table}: ${extras.join(', ')}`);
}

const injected = {
  players: ['location_lat', 'location_lng'],
  peladas: ['member_can_invite_free_agents', 'member_can_invite_new_members'],
  fields: ['latitude', 'longitude'],
  multi_sport_scoreboards: ['score_unit', 'created_by', 'game_id'],
  chat_channels: ['created_by'],
  digital_waivers: ['body', 'version', 'created_by'],
  commercial_subscriptions: ['subscriber_player_id', 'pelada_id', 'establishment_id'],
  client_mutations: ['client_created_at'],
  game_checkin_passes: ['token_hash'],
};
console.log('\nRequired insert columns not supplied by the local model:');
for (const spec of uniqueMappings) {
  const typeName = stateTypes.get(`${spec.store}:${spec.stateKey}`);
  if (!typeName) continue;
  const supplied = new Set([...(interfaces.get(typeName) ?? []).map(snake), ...(injected[spec.table] ?? [])]);
  const missing = (requiredInsertColumns.get(spec.table) ?? []).filter((column) => !supplied.has(column));
  if (missing.length) console.log(`${spec.store}.${spec.stateKey} -> ${spec.table}: ${missing.join(', ')}`);
}
