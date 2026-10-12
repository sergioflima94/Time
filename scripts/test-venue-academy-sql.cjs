const {
  PGlite,
} = require("../.test-runtime/node_modules/@electric-sql/pglite");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const db = new PGlite();
const q = async (s, a = []) => (await db.query(s, a)).rows;
const ids = Array.from(
  { length: 4 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
async function who(i) {
  await db.exec("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [ids[i]]);
  await db.exec("set role authenticated");
}
const a = async (action, data) =>
  (
    await q("select academy_action($1,$2) data", [action, JSON.stringify(data)])
  )[0].data;
const v = async (action, data) =>
  (
    await q("select venue_action($1,$2) data", [action, JSON.stringify(data)])
  )[0].data;
async function run() {
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function vault.create_secret(secret text) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.decrypted_secrets values(k,secret);return k;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
    for (const f of fs
      .readdirSync(path.join(__dirname, "../supabase/migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      try {
        await db.exec(
          fs
            .readFileSync(
              path.join(__dirname, "../supabase/migrations", f),
              "utf8",
            )
            .replace(/^create extension if not exists .*;\r?$/gm, ""),
        );
      } catch (e) {
        throw new Error(`${f}: ${e.message}`);
      }
    }
    for (let i = 0; i < 4; i++)
      await q(
        "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
        [
          ids[i],
          `venue${i}@test.invalid`,
          JSON.stringify({ name: `Pessoa ${i}` }),
        ],
      );
    const players = await q("select id,auth_user_id from players");
    const p = (i) => players.find((x) => x.auth_user_id === ids[i]).id;
    const venue = (
      await q(
        "insert into establishments(owner_player_id,name,payout_method,access_code) values($1,'Arena teste','in_person','VENUETEST') returning id",
        [p(0)],
      )
    )[0].id;
    const field = (
      await q(
        "insert into fields(establishment_id,name,address,created_by,sport_id) values($1,'Quadra teste','Rua teste',$2,'volei') returning id",
        [venue, p(0)],
      )
    )[0].id;
    await who(0);
    await v("staff_save", {
      venueId: venue,
      email: "venue1@test.invalid",
      role: "coach",
      capabilities: ["own_classes", "class_prices", "live"],
    });
    await who(1);
    const program = (
      await a("program_save", {
        venueId: venue,
        name: "Vôlei iniciante",
        sportId: "volei",
        format: "group",
        fieldId: field,
        level: "Iniciante",
        capacity: 6,
        durationMinutes: 60,
        monthlyCents: 18000,
        dropInCents: 3500,
      })
    ).id;
    await assert.rejects(
      v("staff_save", {
        venueId: venue,
        email: "venue2@test.invalid",
        role: "manager",
        capabilities: ["cash"],
      }),
      /Somente o dono/,
    );
    await assert.rejects(q("select * from academy_bills"), /permission denied/);
    const days = await q(
      "select (current_date+10)::text first,(current_date+27)::text last,extract(dow from current_date+10)::int weekday",
    );
    const r = await a("publish", {
      programId: program,
      from: days[0].first,
      until: days[0].last,
      slots: [
        { weekday: days[0].weekday, time: "15:00" },
        { weekday: (days[0].weekday + 2) % 7, time: "15:00" },
      ],
    });
    assert(r.count >= 4);
    assert.equal(
      (
        await a("publish", {
          programId: program,
          from: days[0].first,
          until: days[0].last,
          slots: [
            { weekday: days[0].weekday, time: "15:00" },
            { weekday: (days[0].weekday + 2) % 7, time: "15:00" },
          ],
        })
      ).count,
      0,
    );
    await db.exec("reset role");
    const sessions = await q(
      "select * from class_sessions where program_id=$1 order by starts_at",
      [program],
    );
    await who(2);
    const bill = (
      await a("enroll", {
        sessionId: sessions[0].id,
        plan: "monthly",
        requestId: ids[2],
      })
    ).id;
    await a("enroll", {
      sessionId: sessions[0].id,
      plan: "monthly",
      requestId: ids[2],
    });
    let snap = (await q("select academy_snapshot(null) data"))[0].data;
    assert.equal(snap.bills.length, 1);
    assert.equal(snap.bills[0].amount_cents, 18000);
    assert(snap.seats.length >= 1);
    await assert.rejects(a("cash_received", { billId: bill }), /Sem permissão/);
    await who(1);
    await a("program_save", {
      id: program,
      monthlyCents: 20000,
      dropInCents: 4000,
    });
    await assert.rejects(a("cash_received", { billId: bill }), /Sem permissão/);
    await who(0);
    await a("cash_received", { billId: bill });
    await a("policy", {
      programId: program,
      swaps: true,
      makeups: true,
      cutoffHours: 12,
      makeupDays: 30,
    });
    await who(2);
    snap = (await q("select academy_snapshot(null) data"))[0].data;
    assert.equal(snap.bills[0].amount_cents, 18000);
    const firstSeat = snap.seats.find((x) => x.session_id === sessions[0].id);
    const credit = (await a("makeup_request", { seatId: firstSeat.id })).id;
    await a("enroll", {
      sessionId: sessions[0].id,
      plan: "monthly",
      requestId: "00000000-0000-4000-8000-000000000099",
    });
    assert.equal(
      (await q("select academy_snapshot(null) data"))[0].data.seats.find(
        (s) => s.id === firstSeat.id,
      ).active,
      false,
      "reenrolling must not recreate an excused seat for free",
    );
    await assert.rejects(
      a("makeup_request", { seatId: firstSeat.id }),
      /Reserva inválida/,
    );
    await assert.rejects(
      a("makeup_book", { creditId: credit, sessionId: sessions[1].id }),
      /já tem aula/,
    );
    await who(3);
    const secondBill = (
      await a("enroll", {
        sessionId: sessions[1].id,
        plan: "drop_in",
        requestId: ids[3],
      })
    ).id;
    await who(0);
    await a("cash_received", { billId: secondBill });
    await who(3);
    snap = (await q("select academy_snapshot(null) data"))[0].data;
    const secondSeat = snap.seats.find(
      (x) => x.session_id === sessions[1].id && x.active,
    );
    const swap = (
      await a("offer_swap", {
        seatId: secondSeat.id,
        targetSessionId: sessions[0].id,
      })
    ).id;
    // Return the monthly student's excused seat using its own makeup credit.
    await who(2);
    await a("makeup_book", { creditId: credit, sessionId: sessions[0].id });
    await assert.rejects(
      a("makeup_book", { creditId: credit, sessionId: sessions[0].id }),
      /Crédito/,
    );
    await assert.rejects(a("accept_swap", { swapId: swap }), /já tem aula/);
    const monthlyNow = (await q("select academy_snapshot(null) data"))[0].data;
    await a("makeup_request", {
      seatId: monthlyNow.seats.find(
        (s) => s.session_id === sessions[1].id && s.active,
      ).id,
    });
    await a("accept_swap", { swapId: swap });
    await assert.rejects(
      a("accept_swap", { swapId: swap }),
      /Troca indisponível/,
    );
    snap = (await q("select academy_snapshot(null) data"))[0].data;
    assert.equal(snap.bills.length, 1);
    assert.equal(snap.bills[0].amount_cents, 18000);
    assert(snap.notices.some((n) => n.title === "Troca confirmada"));
    await db.exec("reset role");
    await db.exec(
      "grant select on players,class_sessions,class_programs,class_enrollments to authenticated;",
    );
    await who(2);
    assert(
      (await q("select * from venue_notices")).every(
        (n) => n.player_id === p(2),
      ),
    );
    await who(2); // A replaced/expired revision cannot reuse the original swap source.
    await assert.rejects(
      a("offer_swap", {
        seatId: firstSeat.id,
        targetSessionId: sessions[1].id,
      }),
      /Reserva inválida/,
    );
    await who(0);
    const occ = (
      await v("start_use", {
        venueId: venue,
        fieldId: field,
        label: "Resenha FC",
        minutes: 60,
      })
    ).id;
    const shift = (
      await v("cash_shift", {
        venueId: venue,
        operation: "open",
        amountCents: 10000,
      })
    ).id;
    await assert.rejects(
      v("cash_shift", {
        venueId: venue,
        operation: "open",
        amountCents: 10000,
      }),
      /Já existe/,
    );
    await v("cash_shift", {
      venueId: venue,
      operation: "close",
      shiftId: shift,
      amountCents: 10000,
    });
    await assert.rejects(
      v("start_use", {
        venueId: venue,
        fieldId: field,
        label: "Outro",
        minutes: 60,
      }),
      /unique/,
    );
    await v("end_use", { venueId: venue, id: occ });
    const tab = await v("tab_open", {
      venueId: venue,
      requestId: ids[0],
      name: "Cliente avulso",
      email: "cliente@test.invalid",
      table: "Mesa 3",
      consent: false,
    });
    assert.equal(
      (
        await v("tab_open", {
          venueId: venue,
          requestId: ids[0],
          name: "Cliente avulso",
          email: "cliente@test.invalid",
          consent: false,
        })
      ).tab.id,
      tab.tab.id,
    );
    await who(1);
    let live = (await q("select venue_snapshot($1) data", [venue]))[0].data;
    assert.equal("food_received_cents" in live, false);
    await assert.rejects(
      q("select * from venue_staff_grants"),
      /permission denied/,
    );
    assert.equal((await q("select * from class_enrollments")).length, 0);
    await assert.rejects(
      v("tab_open", {
        venueId: venue,
        requestId: ids[1],
        name: "Indevido",
        email: "x@test.invalid",
      }),
      /Sem acesso/,
    );
    await who(3);
    await assert.rejects(q("select venue_snapshot($1)", [venue]), /Sem acesso/);
    await db.exec("reset role");
    const original = (
      await q("select * from class_programs where id=$1", [program])
    )[0];
    await who(0);
    const compatible = (
      await a("program_save", {
        venueId: venue,
        name: "Outra turma iniciante",
        sportId: "volei",
        format: "group",
        coachId: original.coach_id,
        fieldId: field,
        level: "Iniciante",
        capacity: 6,
        durationMinutes: 60,
        monthlyCents: 20000,
        dropInCents: 4000,
      })
    ).id;
    await a("policy", {
      programId: compatible,
      swaps: true,
      makeups: true,
      cutoffHours: 12,
      makeupDays: 30,
    });
    await a("publish", {
      programId: compatible,
      from: days[0].first,
      until: days[0].first,
      slots: [{ weekday: days[0].weekday, time: "17:00" }],
    });
    await db.exec("reset role");
    const target = (
      await q("select id from class_sessions where program_id=$1", [compatible])
    )[0].id;
    await who(2);
    await a("enroll", {
      sessionId: target,
      plan: "drop_in",
      requestId: "00000000-0000-4000-8000-000000000100",
    });
    await who(3);
    const current = (
      await q("select academy_snapshot(null) data")
    )[0].data.seats.find((s) => s.active && s.session_id === sessions[0].id);
    const cross = (
      await a("offer_swap", { seatId: current.id, targetSessionId: target })
    ).id;
    await who(2);
    await a("accept_swap", { swapId: cross });
    await who(3);
    assert(
      (await q("select academy_snapshot(null) data"))[0].data.seats.some(
        (s) => s.id === current.id && s.session_id === target,
      ),
    );
    await assert.rejects(
      q("select venue_invite_service($1,$2,$3,null)", [ids[0], ids[0], "peek"]),
      /permission denied/,
    );
    console.log(
      "PASS: preços mensais/avulsos, cobrança mensal única, preço congelado, permissões, recorrência idempotente, reposição, PDV e cronômetro.",
    );
  } finally {
    await db.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
