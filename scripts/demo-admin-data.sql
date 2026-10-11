-- Explicit, opt-in demo data. NOT a migration: never runs on installation.
-- Caller must set marcoujogou.demo_email and marcoujogou.demo_auth_id locally
-- in a transaction. Existing records are never updated or deleted.
do $demo$
declare
  account_id uuid;
  owner_id uuid;
  team_id uuid;
  venue_id uuid;
  row_id uuid;
  item record;
  inserted integer;
  changes integer := 0;
begin
  select u.id, p.id into account_id, owner_id
    from auth.users u join public.players p on p.auth_user_id = u.id
    join public.platform_admin_accounts a on a.auth_user_id = u.id
    where lower(u.email) = lower(current_setting('marcoujogou.demo_email'))
      and u.id = current_setting('marcoujogou.demo_auth_id')::uuid
      and not p.is_guest and a.active and a.role in ('owner', 'admin')
      and not exists(select 1 from public.platform_account_controls c where c.player_id = p.id and c.suspended);
  if owner_id is null then raise exception 'DEMO: conta admin ativa e identidade esperada não encontradas'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marcoujogou:demo-admin:v1:' || owner_id::text, 0));
  if exists(select 1 from unnest(array['futebol','volei','basquete','handebol','futvolei']) s(id)
      left join public.sport_catalog c on c.id = s.id where not coalesce((c.definition->>'active')::boolean, false)) then
    raise exception 'DEMO: ative as cinco modalidades do catálogo antes de criar os dados';
  end if;
  team_id := md5('marcoujogou:demo-admin:v1:' || owner_id::text || ':team')::uuid;
  venue_id := md5('marcoujogou:demo-admin:v1:' || owner_id::text || ':venue')::uuid;
  if exists(select 1 from public.peladas where id = team_id and created_by <> owner_id)
    or exists(select 1 from public.establishments where id = venue_id and owner_player_id <> owner_id) then
    raise exception 'DEMO: cadastro já associado a outra pessoa; nenhuma alteração realizada';
  end if;
  insert into public.peladas(id, name, description, sport_id, football_variant,
    default_max_players, default_match_minutes, invite_code, created_by)
    values(team_id, '[DEMO] Resenha FC',
      'Time fictício para validar o MarcouJogou. Os convidados do elenco não são usuários reais. Sem mensagens ou cobranças automáticas.',
      'futebol', 'society', 12, 10, 'DEMO' || upper(substr(md5(team_id::text),1,8)), owner_id)
    on conflict(id) do nothing;
  get diagnostics inserted = row_count; changes := changes + inserted;
  -- Do not reactivate or change a membership that was deliberately edited later.
  insert into public.pelada_memberships(pelada_id, player_id, role, active)
    values(team_id, owner_id, 'admin', true) on conflict(pelada_id, player_id) do nothing;
  get diagnostics inserted = row_count; changes := changes + inserted;
  insert into public.establishments(id, owner_player_id, name, payout_method, access_code, whatsapp_opt_in)
    values(venue_id, owner_id, '[DEMO] Arena Multiesportes', 'in_person',
      'DEMO' || upper(substr(md5(venue_id::text),1,8)), false) on conflict(id) do nothing;
  get diagnostics inserted = row_count; changes := changes + inserted;
  for item in select * from (values
      (1, '[DEMO] Campo Society', 'futebol', array['futebol']::text[], 'Gramado sintético fictício para futebol society.'),
      (2, '[DEMO] Quadra de Vôlei', 'volei', array['volei']::text[], 'Quadra coberta fictícia de vôlei.'),
      (3, '[DEMO] Quadra de Basquete', 'basquete', array['basquete']::text[], 'Quadra fictícia com duas tabelas.'),
      (4, '[DEMO] Quadra de Handebol', 'handebol', array['handebol']::text[], 'Quadra fictícia com traves e marcações de handebol.'),
      (5, '[DEMO] Areia Vôlei / Futevôlei', 'volei', array['volei','futvolei']::text[], 'Um único espaço físico híbrido; reservas de uma modalidade bloqueiam a outra.')
    ) v(n, name, sport, sports, notes)
  loop
    row_id := md5('marcoujogou:demo-admin:v1:' || owner_id::text || ':field:' || item.n::text)::uuid;
    if exists(select 1 from public.fields where id = row_id and
        (establishment_id is distinct from venue_id or created_by <> owner_id)) then
      raise exception 'DEMO: quadra já associada a outro cadastro';
    end if;
    insert into public.fields(id, pelada_id, establishment_id, name, sport_id, sport_ids, address, notes, created_by)
      values(row_id, case when item.n = 1 then team_id else null end, venue_id, item.name,
        item.sport, item.sports, '[DEMO] Endereço fictício — não visitar', item.notes, owner_id)
      on conflict(id) do nothing;
    get diagnostics inserted = row_count; changes := changes + inserted;
  end loop;
  -- Eleven guests + the existing administrator = twelve players. No auth users,
  -- invented e-mail/phone/location, premiums, ratings or fabricated history.
  for item in select * from (values
      (1,'Rafa Muralha','goalkeeper'), (2,'Dudu Luva','goalkeeper'),
      (3,'Bia Passe','line'), (4,'Caio Canhota','line'), (5,'Léo Correria','line'),
      (6,'Nina Defesa','line'), (7,'Gui Pivô','line'), (8,'Mari Toque','line'),
      (9,'Vini Chute','line'), (10,'Lari Drible','line'), (11,'Pedro Resenha','line')
    ) v(n, name, position)
  loop
    row_id := md5('marcoujogou:demo-admin:v1:' || owner_id::text || ':guest:' || item.n::text)::uuid;
    if exists(select 1 from public.players where id = row_id and (not is_guest or auth_user_id is not null)) then
      raise exception 'DEMO: identificador de convidado pertence a uma conta real';
    end if;
    insert into public.players(id, name, is_guest, preferred_position, favorite_sports)
      values(row_id, '[DEMO] ' || item.name, true, item.position, array['futebol']) on conflict(id) do nothing;
    get diagnostics inserted = row_count; changes := changes + inserted;
    insert into public.pelada_memberships(pelada_id, player_id, role, active)
      values(team_id, row_id, 'member', true) on conflict(pelada_id, player_id) do nothing;
    get diagnostics inserted = row_count; changes := changes + inserted;
  end loop;
  if changes > 0 then
    insert into public.platform_admin_audit(actor_auth_user_id, action, target_id, reason, after_value)
      values(account_id, 'demo_admin_seed', team_id::text,
        'Dados fictícios solicitados pelo administrador para validar time e estabelecimento multiesporte.',
        jsonb_build_object('version',1,'teamId',team_id,'establishmentId',venue_id,'insertedRecords',changes,
          'guestPlayers',11,'physicalFields',5,'directoryPublished',false,'messagesSent',false,'paymentsCreated',false));
  end if;
end;
$demo$;
