create table venue_credit_preferences(account_id uuid primary key references venue_credit_accounts(id),in_app boolean not null default true,email boolean not null default false,whatsapp boolean not null default false,updated_at timestamptz not null default now());
create table venue_credit_reminders(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),account_id uuid not null references venue_credit_accounts(id),stage text not null check(stage in('before_due','due','overdue')),channel text not null check(channel in('app','email','whatsapp')),status text not null default 'queued' check(status in('queued','sending','available','accepted','failed','uncertain','cancelled')),provider_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(invoice_id,stage,channel));
create table venue_credit_job_config(id boolean primary key default true check(id),secret_id uuid not null,url text not null);
do $$declare t text;begin foreach t in array array['venue_credit_preferences','venue_credit_reminders','venue_credit_job_config'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create function credit_reminder_stage(i uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$select case when credit_balance(id)<=0 then null when due_date<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' when due_date=(now() at time zone 'America/Sao_Paulo')::date then 'due' when due_date<=(now() at time zone 'America/Sao_Paulo')::date+3 then 'before_due' end from venue_credit_invoices where id=i$$;
create function credit_reminders_generate() returns int language plpgsql security definer set search_path=public,pg_temp as $$declare item record;channel text;pref venue_credit_preferences;counted int:=0;r uuid;begin
 update venue_credit_reminders set status='cancelled',updated_at=now() where status='queued' and stage is distinct from credit_reminder_stage(invoice_id);
 -- One relevant invoice per account, rather than a burst for every old unpaid month.
 for item in select distinct on(i.account_id) i.*,a.player_id,a.establishment_id,credit_reminder_stage(i.id) stage from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id where credit_reminder_stage(i.id) is not null and credit_actor_allowed(a.player_id) order by i.account_id,i.due_date,i.id loop
  select * into pref from venue_credit_preferences where account_id=item.account_id;
  foreach channel in array array['app','email','whatsapp'] loop
   if channel='app' and coalesce(pref.in_app,true) or channel='email' and coalesce(pref.email,false) or channel='whatsapp' and coalesce(pref.whatsapp,false) then
    insert into venue_credit_reminders(invoice_id,account_id,stage,channel) values(item.id,item.account_id,item.stage,channel) on conflict do nothing returning id into r;
    if r is not null then counted:=counted+1;
     if channel='app' then
      insert into venue_notices(player_id,establishment_id,title,body) values(item.player_id,item.establishment_id,case item.stage when 'overdue' then 'Fatura em atraso' when 'due' then 'Fatura vence hoje' else 'Sua fatura vence em breve' end,'Consulte Minhas faturas para ver saldo, vencimento e formas de pagamento.');
      update venue_credit_reminders set status='available',updated_at=now() where id=r;
     end if;
    end if;
   end if;
  end loop;
 end loop;return counted;
end$$;
alter function credit_action(text,jsonb) rename to credit_action_v4;
revoke all on function credit_action_v4(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid:=community_chat_me();a venue_credit_accounts;t venue_credit_intents;i venue_credit_invoices;request venue_credit_requests;nonce uuid;begin
 if p_action not in('reminder_preferences','resolve_review','release_checkout') then return credit_action_v4(p_action,p_data);end if;
 if me is null or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>8192 then raise exception 'FATURA: Entre na conta e informe dados válidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into request from venue_credit_requests where id=nonce;
 if request.id is not null then if request.actor<>me or request.action<>p_action or request.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return request.result;end if;
 if p_action='reminder_preferences' then
  select * into a from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;
  if a.player_id is distinct from me then raise exception 'FATURA: Só o cliente escolhe seus lembretes.';end if;
  if jsonb_typeof(p_data->'inApp') is distinct from 'boolean' or jsonb_typeof(p_data->'email') is distinct from 'boolean' or jsonb_typeof(p_data->'whatsapp') is distinct from 'boolean' then raise exception 'FATURA: Preferência inválida.';end if;
  if (p_data->>'email')::boolean and not exists(select 1 from auth.users u join players p on p.auth_user_id=u.id where p.id=me and to_jsonb(u)->>'email_confirmed_at' is not null) then raise exception 'FATURA: Confirme seu e-mail antes de ativar.';end if;
  if (p_data->>'whatsapp')::boolean and not exists(select 1 from auth.users u join players p on p.auth_user_id=u.id where p.id=me and to_jsonb(u)->>'phone_confirmed_at' is not null and to_jsonb(u)->>'phone' ~ '^55[0-9]{10,11}$') then raise exception 'FATURA: WhatsApp exige telefone brasileiro verificado na conta, não apenas no perfil.';end if;
  insert into venue_credit_preferences values(a.id,(p_data->>'inApp')::boolean,(p_data->>'email')::boolean,(p_data->>'whatsapp')::boolean,now()) on conflict(account_id) do update set in_app=excluded.in_app,email=excluded.email,whatsapp=excluded.whatsapp,updated_at=now();
  update venue_credit_reminders set status='cancelled',updated_at=now() where account_id=a.id and status='queued' and ((channel='app' and not (p_data->>'inApp')::boolean) or (channel='email' and not (p_data->>'email')::boolean) or (channel='whatsapp' and not (p_data->>'whatsapp')::boolean));
 else
  select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;select * into i from venue_credit_invoices where id=t.invoice_id;select * into a from venue_credit_accounts where id=i.account_id for update;
  select * into t from venue_credit_intents where id=t.id for update;
  if not is_establishment_owner(a.establishment_id) then raise exception 'FATURA: Só o dono trata divergências.';end if;
  if (p_data->>'confirmed')::boolean is distinct from true or coalesce(length(trim(p_data->>'reason')),0) not between 8 and 500 then raise exception 'FATURA: Confirme a conferência e informe o motivo.';end if;
  if p_action='release_checkout' then
   if t.payment_id is not null or now()<t.expires_at+interval '5 minutes' or t.state not in('building','pending','uncertain','review') then raise exception 'FATURA: Cobrança ainda ativa ou já paga. Consulte o provedor.';end if;
   -- Human exception, never described as an automatic provider confirmation.
   update venue_credit_intents set state='cancelled' where id=t.id;
  else
   update venue_credit_gateway_reviews set resolved_at=now(),resolved_by=me,resolution=trim(p_data->>'reason') where intent_id=t.id and resolved_at is null;
   update venue_credit_intents set state=case when payment_id is not null then case when exists(select 1 from venue_credit_reversals where payment_id=t.payment_id) then 'refunded' else 'paid' end when external_id is null then 'uncertain' else 'pending' end where id=t.id;
  end if;
  insert into venue_audit(establishment_id,actor,action,target_id,details) values(a.establishment_id,me,'credit_'||p_action,t.id,jsonb_build_object('reason',trim(p_data->>'reason'),'human_confirmation',true));
  insert into venue_notices(player_id,establishment_id,title,body) values(a.player_id,a.establishment_id,'Conferência financeira do estabelecimento','O dono registrou uma conferência manual. Consulte o extrato; isso não comprova novo pagamento.');perform venue_ping(a.establishment_id);
 end if;
 insert into venue_credit_requests values(nonce,me,p_action,p_data,jsonb_build_object('id',coalesce(t.id,a.id)),now());return jsonb_build_object('id',coalesce(t.id,a.id));
end$$;
create function credit_reminder_service(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r venue_credit_reminders;pref venue_credit_preferences;result jsonb;begin
 if auth.role()<>'service_role' then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action='generate' then return jsonb_build_object('generated',credit_reminders_generate());end if;
 if p_action='claim' then
  select x.* into r from venue_credit_reminders x join venue_credit_preferences f on f.account_id=x.account_id where x.status='queued' and x.channel in('email','whatsapp') and x.stage=credit_reminder_stage(x.invoice_id) and
   ((x.channel='email' and f.email) or (x.channel='whatsapp' and f.whatsapp)) and x.channel=any(array(select jsonb_array_elements_text(coalesce(p_data->'channels','["email","whatsapp"]'::jsonb)))) and not exists(select 1 from venue_credit_reminders z where z.account_id=x.account_id and z.channel=x.channel and z.status in('sending','accepted','uncertain') and (z.updated_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date)
   order by x.created_at,x.id for update of x skip locked limit 1;
  if r.id is null then return '{}';end if;
  select jsonb_build_object('id',r.id,'channel',r.channel,'email',u.email,'phone',case when to_jsonb(u)->>'phone_confirmed_at' is not null then to_jsonb(u)->>'phone' end) into result from venue_credit_accounts a join players p on p.id=a.player_id join auth.users u on u.id=p.auth_user_id where a.id=r.account_id and credit_actor_allowed(p.id) and
   ((r.channel='email' and to_jsonb(u)->>'email_confirmed_at' is not null) or (r.channel='whatsapp' and to_jsonb(u)->>'phone_confirmed_at' is not null and to_jsonb(u)->>'phone' ~ '^55[0-9]{10,11}$'));
  if result is null then update venue_credit_reminders set status='cancelled',updated_at=now() where id=r.id;return jsonb_build_object('skipped',true);end if;
  update venue_credit_reminders set status='sending',updated_at=now() where id=r.id;return result;
 end if;
 if p_action not in('accepted','failed','uncertain') then raise exception 'FATURA: Ação inválida.';end if;
 update venue_credit_reminders set status=p_action,provider_id=nullif(left(p_data->>'providerId',150),''),updated_at=now() where id=(p_data->>'id')::uuid and status='sending';return '{}';
end$$;
-- Enrich private metadata; public account/statement endpoints still enforce scope.
alter function credit_snapshot(uuid,uuid,text) rename to credit_snapshot_v2;
revoke all on function credit_snapshot_v2(uuid,uuid,text) from public,anon,authenticated;
create function credit_snapshot(p_venue uuid default null,p_tab uuid default null,p_mode text default 'statement') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;me uuid:=community_chat_me();begin
 result:=credit_snapshot_v2(p_venue,p_tab,p_mode);if p_mode<>'statement' then return result;end if;
 return result||jsonb_build_object('preferences',coalesce((select jsonb_agg(jsonb_build_object('account_id',a.id,'in_app',coalesce(f.in_app,true),'email',coalesce(f.email,false),'whatsapp',coalesce(f.whatsapp,false),'email_verified',to_jsonb(u)->>'email_confirmed_at' is not null,'phone_verified',to_jsonb(u)->>'phone_confirmed_at' is not null and to_jsonb(u)->>'phone' ~ '^55[0-9]{10,11}$')) from venue_credit_accounts a left join venue_credit_preferences f on f.account_id=a.id join players p on p.id=a.player_id join auth.users u on u.id=p.auth_user_id where a.player_id=me and (p_venue is null or a.establishment_id=p_venue)),'[]'::jsonb),
 'reminders',coalesce((select jsonb_agg(x) from (select r.id,r.invoice_id,r.channel,r.stage,r.status,r.updated_at from venue_credit_reminders r join venue_credit_accounts a on a.id=r.account_id where (p_venue is null or a.establishment_id=p_venue) and (a.player_id=me or p_venue is not null and (venue_can(p_venue,'cash') or venue_can(p_venue,'reports'))) order by r.created_at desc limit 30)x),'[]'::jsonb),
 'reminders_scheduled',exists(select 1 from venue_credit_job_config));
end$$;
create function credit_reminder_setup(p_secret text,p_url text) returns void language plpgsql security definer set search_path=public,vault,pg_temp as $$declare k uuid;begin
 if auth.role()<>'service_role' or coalesce(length(p_secret),0)<32 or p_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/invoice-reminders$' then raise exception 'FATURA: Configuração de serviço inválida.';end if;
 k:=vault.create_secret(p_secret);insert into venue_credit_job_config values(true,k,p_url) on conflict(id) do update set secret_id=excluded.secret_id,url=excluded.url;
end$$;
create function credit_reminders_tick() returns void language plpgsql security definer set search_path=public,vault,pg_temp as $$declare c venue_credit_job_config;token text;begin
 perform credit_reminders_generate();select * into c from venue_credit_job_config;
 if c.id is not null and to_regnamespace('net') is not null then
  select decrypted_secret into token from vault.decrypted_secrets where id=c.secret_id;
  if token is not null then execute 'select net.http_post(url := $1,body := $2,headers := $3,timeout_milliseconds := 10000)' using c.url,'{}'::jsonb,jsonb_build_object('Content-Type','application/json','x-invoice-job',token);end if;
 end if;
end$$;
revoke all on function credit_reminder_stage(uuid),credit_reminders_generate(),credit_reminder_service(text,jsonb),credit_reminder_setup(text,text),credit_reminders_tick(),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_reminder_service(text,jsonb),credit_reminder_setup(text,text),credit_reminders_generate() to service_role;
grant execute on function credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) to authenticated;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$begin if to_regnamespace('cron') is not null then perform cron.schedule('invoice-customer-reminders','0 12 * * *','select public.credit_reminders_tick();');end if;end$$;
