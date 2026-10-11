// Isolated PostgreSQL only. Never reads credentials or creates live accounts.
const { PGlite } = require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const db = new PGlite();
const adminAuth = '00000000-0000-4000-8000-000000000001';
const otherAuth = '00000000-0000-4000-8000-000000000002';
const email = 'demo-admin@test.invalid';
const seed = fs.readFileSync(path.join(__dirname, 'demo-admin-data.sql'), 'utf8');
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
async function apply(targetEmail = email, targetId = adminAuth) {
  await db.exec('begin');
  try {
    await q("select set_config('marcoujogou.demo_email',$1,true),set_config('marcoujogou.demo_auth_id',$2,true)", [targetEmail, targetId]);
    await db.exec(seed);
    await db.exec('commit');
  } catch (error) { await db.exec('rollback'); throw error; }
}
async function totals() {
  const result = {};
  for (const table of ['players','peladas','pelada_memberships','establishments','fields','platform_admin_audit',
    'games','field_bookings','field_directory_entries','venue_reviews','payments','payment_gateway_connections']) {
    result[table] = Number((await q(`select count(*) n from ${table}`))[0].n);
  }
  return result;
}
async function run() {
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_user::text$$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant execute on all functions in schema auth to authenticated,anon,service_role;`);
    for (const file of fs.readdirSync(path.join(__dirname, '../supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8').replace(/^create extension if not exists .*;\r?$/gm, ''));
    }
    await q('insert into auth.users(id,email) values($1,$2),($3,$4)', [adminAuth, email, otherAuth, 'other@test.invalid']);
    const admin = (await q('select id from players where auth_user_id=$1', [adminAuth]))[0].id;
    await q("insert into platform_admin_accounts(auth_user_id,role) values($1,'owner')", [adminAuth]);
    const before = await totals();
    await assert.rejects(apply(email, otherAuth), /identidade esperada/);
    await assert.rejects(apply('other@test.invalid', otherAuth), /admin ativa/);
    assert.deepEqual(await totals(), before);
    await db.exec("update sport_catalog set definition=jsonb_set(definition,'{active}','false') where id='volei'");
    await assert.rejects(apply(), /cinco modalidades/);
    assert.deepEqual(await totals(), before);
    await db.exec("update sport_catalog set definition=jsonb_set(definition,'{active}','true') where id='volei'");
    await apply();
    const after = await totals();
    for (const [table, increase] of Object.entries({players:11,peladas:1,pelada_memberships:12,establishments:1,fields:5,platform_admin_audit:1})) {
      assert.equal(after[table] - before[table], increase, table);
    }
    for (const table of ['games','field_bookings','field_directory_entries','venue_reviews','payments','payment_gateway_connections']) assert.equal(after[table], before[table], table);
    assert.equal(Number((await q('select count(*) n from auth.users'))[0].n), 2);
    const team = (await q("select * from peladas where name='[DEMO] Resenha FC'"))[0];
    const venue = (await q("select * from establishments where name='[DEMO] Arena Multiesportes'"))[0];
    assert.equal(team.created_by, admin); assert.equal(venue.owner_player_id, admin);
    assert.equal(venue.whatsapp_opt_in, false); assert.equal(venue.pix_key, null); assert.equal(venue.payout_method, 'in_person');
    const guests = await q('select * from players where is_guest');
    assert.equal(guests.filter(p => p.preferred_position === 'goalkeeper').length, 2);
    assert.ok(guests.every(p => p.auth_user_id === null && p.name.startsWith('[DEMO]') && p.phone === null && !p.free_agent_opt_in));
    const fields = await q('select * from fields where establishment_id=$1', [venue.id]);
    assert.equal(new Set(fields.flatMap(f => f.sport_ids)).size, 5);
    const hybrid = fields.find(f => f.sport_ids.length === 2); assert.deepEqual(hybrid.sport_ids, ['volei','futvolei']);
    assert.equal(fields.filter(f => f.pelada_id === team.id).length, 1);
    // A rerun preserves edits and does not create duplicate audit entries or guests.
    await q('update peladas set description=$1 where id=$2', ['Editado pelo dono', team.id]);
    await apply(); assert.deepEqual(await totals(), after);
    assert.equal((await q('select description from peladas where id=$1', [team.id]))[0].description, 'Editado pelo dono');
    // A collision partway through a fresh seed rolls the whole operation back.
    await q("insert into platform_admin_accounts(auth_user_id,role) values($1,'admin')", [otherAuth]);
    const other = (await q('select id from players where auth_user_id=$1', [otherAuth]))[0].id;
    await q("insert into fields(id,establishment_id,name,created_by) values(md5('marcoujogou:demo-admin:v1:' || $1::text || ':field:3')::uuid,$2,'Não sobrescrever',$3)", [other, venue.id, admin]);
    const collisionTotals = await totals();
    await assert.rejects(apply('other@test.invalid', otherAuth), /quadra já associada/);
    assert.deepEqual(await totals(), collisionTotals);
    // The actual logged-in owner can load all five spaces and twelve members via RLS.
    // Supabase grants these tables through its default privileges; isolated PG does not.
    await db.exec('grant select on fields,establishments,players,pelada_memberships,peladas to authenticated');
    await q("select set_config('request.jwt.claim.sub',$1,false)", [adminAuth]);
    await db.exec('set role authenticated');
    assert.equal((await q('select id from fields where establishment_id=$1', [venue.id])).length, 6); // includes the unrelated collision fixture
    assert.equal((await q('select player_id from pelada_memberships where pelada_id=$1', [team.id])).length, 12);
    assert.equal((await q('select id from establishments where owner_player_id=$1', [admin])).length, 1);
    console.log('PASS: demo associado ao admin, 11 convidados, 5 espaços/5 esportes e quadra híbrida; idempotência, preservação, validação de identidade, rollback e leitura RLS. Sem contas reais, mensagens, pagamentos ou publicação no diretório.');
  } finally { await db.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
