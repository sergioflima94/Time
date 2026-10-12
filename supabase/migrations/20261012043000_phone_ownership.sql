create table customer_phone_challenges(id uuid primary key default gen_random_uuid(),player_id uuid not null references players(id),phone text not null check(phone ~ '^55[0-9]{10,11}$'),salt uuid not null default gen_random_uuid(),code_hash text not null,attempts int not null default 0,status text not null default 'issued' check(status in('issued','verified','completed','expired')),created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '5 minutes'));
alter table customer_phone_challenges enable row level security;revoke all on customer_phone_challenges from anon,authenticated;
create function phone_ownership_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid;c customer_phone_challenges;wanted_phone text;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>2048 then raise exception 'TELEFONE: Serviço não autorizado.';end if;
 select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
 if not credit_actor_allowed(me) then raise exception 'TELEFONE: Entre numa conta ativa.';end if;
 perform pg_advisory_xact_lock(hashtext('phone-actor:'||me::text));
 if p_action='create' then
  wanted_phone:=p_data->>'phone';if wanted_phone is null or wanted_phone !~ '^55[0-9]{10,11}$' or coalesce(p_data->>'hash','') !~ '^[a-f0-9]{64}$' or nullif(p_data->>'id','') is null or nullif(p_data->>'salt','') is null then raise exception 'TELEFONE: Dados inválidos.';end if;
  perform pg_advisory_xact_lock(hashtext('phone-number:'||wanted_phone));
  if exists(select 1 from customer_phone_challenges where player_id=me and created_at>now()-interval '1 minute') or (select count(*) from customer_phone_challenges where player_id=me and created_at>now()-interval '1 day')>=5 then raise exception 'TELEFONE: Aguarde; limite de códigos atingido.';end if;
  if exists(select 1 from customer_phone_challenges where customer_phone_challenges.phone=wanted_phone and player_id<>me and status in('issued','verified') and expires_at>now()) or exists(select 1 from auth.users u where u.id<>(p_data->>'actor')::uuid and to_jsonb(u)->>'phone'=wanted_phone and to_jsonb(u)->>'phone_confirmed_at' is not null) then raise exception 'TELEFONE: Número indisponível para esta conta.';end if;
  update customer_phone_challenges set status='expired' where player_id=me and status in('issued','verified');
  insert into customer_phone_challenges(id,player_id,phone,salt,code_hash) values((p_data->>'id')::uuid,me,wanted_phone,(p_data->>'salt')::uuid,p_data->>'hash') returning * into c;
 else
  select * into c from customer_phone_challenges where id=(p_data->>'id')::uuid and player_id=me for update;
  if c.id is null or c.expires_at<=now() or c.status='expired' or c.attempts>=5 then return jsonb_build_object('valid',false,'expired',true);end if;
  if p_action='context' then return jsonb_build_object('salt',c.salt,'phone',c.phone);
  elsif p_action='verify' then
   if c.status='completed' then return jsonb_build_object('valid',exists(select 1 from auth.users u where u.id=(p_data->>'actor')::uuid and to_jsonb(u)->>'phone'=c.phone and to_jsonb(u)->>'phone_confirmed_at' is not null),'completed',true,'phone',c.phone);end if;
   if c.code_hash is distinct from p_data->>'hash' then update customer_phone_challenges set attempts=attempts+1 where id=c.id;return jsonb_build_object('valid',false);end if;
   update customer_phone_challenges set status='verified' where id=c.id;return jsonb_build_object('valid',true,'phone',c.phone);
  elsif p_action='complete' then
   if c.status<>'verified' or not exists(select 1 from auth.users u where u.id=(p_data->>'actor')::uuid and to_jsonb(u)->>'phone'=c.phone and to_jsonb(u)->>'phone_confirmed_at' is not null) then raise exception 'TELEFONE: Autenticação ainda não confirmou.';end if;
   update customer_phone_challenges set status='completed',code_hash=repeat('0',64) where id=c.id;return jsonb_build_object('valid',true);
  else raise exception 'TELEFONE: Ação inválida.';end if;
 end if;return jsonb_build_object('id',c.id);
end$$;
revoke all on function phone_ownership_service(text,jsonb) from public,anon,authenticated;grant execute on function phone_ownership_service(text,jsonb) to service_role;
