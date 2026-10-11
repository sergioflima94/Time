const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { homeGameAgenda, homeGameDistance } = require('../src/lib/home.ts');
const now = Date.parse('2026-10-11T15:00:00Z');
const game = (id, status, scheduledAt) => ({ id, status, scheduledAt });
const games = [game('future', 'open', '2026-10-12T15:00:00Z'), game('live', 'in_progress', '2026-10-11T14:00:00Z'),
  game('old-drawn', 'teams_drawn', '2026-09-11T15:00:00Z'), game('cancelled', 'cancelled', '2026-10-11T16:00:00Z'),
  game('finished', 'finished', '2026-10-10T15:00:00Z'), game('later', 'full', '2026-10-13T15:00:00Z')];
const agenda = homeGameAgenda(games, now);
assert.equal(agenda.featured.id, 'live');
assert.deepEqual(agenda.remaining.map(g => g.id), ['future', 'later']);
assert.deepEqual(agenda.past.map(g => g.id), ['finished']);
assert.equal(homeGameAgenda(games.filter(g => g.id !== 'live'), now).featured.id, 'future');
assert.equal(homeGameAgenda([], now).featured, undefined);
assert.equal(homeGameDistance('2026-10-12T23:00:00', new Date('2026-10-11T01:00:00')), 'Amanhã');
assert.equal(homeGameDistance('2026-10-11T23:00:00', new Date('2026-10-11T01:00:00')), 'Hoje');
assert.equal(homeGameDistance('2026-10-14T12:00:00', new Date('2026-10-11T23:00:00')), 'Em 3 dias');
console.log('PASS: Home prioritizes live games, excludes stale/cancelled matches, no duplicates, calendar-day labels.');
