-- Write-only credentials in Vault; no tokens in public configuration or audit.
create table public.platform_whatsapp_integrations (
  provider text primary key check(provider in('evolution_api','evolution_go')),
  url text not null,
  secret_id uuid not null,
  instance_name text not null,
  enabled boolean not null default false,
  revision integer not null default 1,
  probe_ok boolean not null default false,
  tested_at timestamptz,
  state text not null default 'unknown' check(state in('unknown','connecting','open','close')),
  provision_state text not null default 'none' check(provision_state in('none','creating','created','uncertain')),
  updated_at timestamptz not null default now()
);
alter table public.platform_whatsapp_integrations enable row level security;
revoke all on public.platform_whatsapp_integrations from public,anon,authenticated;
grant select,insert,update on public.platform_whatsapp_integrations to service_role;

create function public.platform_whatsapp_service(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare a uuid; r public.platform_whatsapp_integrations; old public.platform_whatsapp_integrations; k uuid; creds jsonb; previous jsonb; changed_host boolean; secret_changed boolean; why text;
begin
  if auth.role() is distinct from 'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>32768 then raise exception 'WHATSAPP: Serviço não autorizado'; end if;
  if p_action='runtime' then
    return coalesce((select jsonb_object_agg(c.provider,jsonb_build_object('enabled',c.enabled,'url',c.url,'instance',c.instance_name,'revision',c.revision,'key',v.decrypted_secret::jsonb->>'key','globalKey',v.decrypted_secret::jsonb->>'globalKey','webhookSecret',v.decrypted_secret::jsonb->>'webhookSecret')) from platform_whatsapp_integrations c join vault.decrypted_secrets v on v.id=c.secret_id),'{}'::jsonb);
  end if;
  a:=(p_data->>'actor')::uuid;
  if not exists(select 1 from platform_admin_accounts where auth_user_id=a and active and role in('owner','admin'))
    or exists(select 1 from platform_account_controls c join players p on p.id=c.player_id where p.auth_user_id=a and c.suspended)
    then raise exception 'WHATSAPP: Acesso exclusivo de administradores da plataforma'; end if;
  if p_action='metadata' then
    return coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'url',c.url,'instance',c.instance_name,'enabled',c.enabled,'revision',c.revision,'hasToken',true,'hasGlobalKey',coalesce(length(v.decrypted_secret::jsonb->>'globalKey'),0)>0,'probeOk',c.probe_ok,'testedAt',c.tested_at,'state',c.state,'provisionState',c.provision_state)) from platform_whatsapp_integrations c join vault.decrypted_secrets v on v.id=c.secret_id),'[]'::jsonb);
  end if;
  if p_data->>'provider' is null or p_data->>'provider' not in('evolution_api','evolution_go') then raise exception 'WHATSAPP: Provedor inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-wa:'||(p_data->>'provider'),0));
  select * into old from platform_whatsapp_integrations where provider=p_data->>'provider' for update;
  if p_action='context' then
    if old.provider is null then raise exception 'WHATSAPP: Salve a configuração primeiro'; end if;
    select decrypted_secret::jsonb into creds from vault.decrypted_secrets where id=old.secret_id;
    return jsonb_build_object('provider',old.provider,'url',old.url,'instance',old.instance_name,'revision',old.revision,'enabled',old.enabled,'provisionState',old.provision_state,'key',creds->>'key','globalKey',creds->>'globalKey','webhookSecret',creds->>'webhookSecret');
  end if;
  if coalesce((p_data->>'revision')::integer,0)<>coalesce(old.revision,0) then raise exception 'WHATSAPP: Configuração mudou. Atualize antes de repetir'; end if;
  why:=btrim(coalesce(p_data->>'reason',''));
  if old.secret_id is not null then
    select decrypted_secret::jsonb into previous from vault.decrypted_secrets where id=old.secret_id;
    if position(previous->>'key' in why)>0 or (length(coalesce(previous->>'globalKey',''))>0 and position(previous->>'globalKey' in why)>0) then raise exception 'WHATSAPP: Não coloque credenciais no motivo'; end if;
  end if;
  if p_action in('save','enable','claim_create') and length(why) not between 8 and 500 then raise exception 'WHATSAPP: Informe motivo de 8 a 500 caracteres'; end if;
  if p_action='save' then
    if coalesce(p_data->>'url','') !~ '^https://[^[:space:]?#@]+$' or length(p_data->>'url')>500 then raise exception 'WHATSAPP: Host HTTPS obrigatório'; end if;
    if old.secret_id is not null then select decrypted_secret::jsonb into previous from vault.decrypted_secrets where id=old.secret_id; end if;
    changed_host:=old.url is distinct from p_data->>'url';
    if changed_host and old.provider is not null and nullif(p_data->>'key','') is null then raise exception 'WHATSAPP: Novo host exige informar o token novamente'; end if;
    creds:=jsonb_build_object('key',coalesce(nullif(p_data->>'key',''),previous->>'key'),
      'globalKey',coalesce(nullif(p_data->>'globalKey',''),case when not changed_host then previous->>'globalKey' end),
      'webhookSecret',coalesce(nullif(p_data->>'webhookSecret',''),case when not changed_host then previous->>'webhookSecret' end,replace(gen_random_uuid()::text,'-','')));
    if coalesce(length(creds->>'key'),0) not between 8 and 8192 or coalesce(length(creds->>'webhookSecret'),0) not between 16 and 512 or coalesce(length(creds->>'globalKey'),0)>8192 then raise exception 'WHATSAPP: Credenciais inválidas'; end if;
    if creds->>'key' ~ '[\r\n]' or creds->>'globalKey' ~ '[\r\n]' or position(creds->>'key' in why)>0 or (length(coalesce(creds->>'globalKey',''))>0 and position(creds->>'globalKey' in why)>0) then raise exception 'WHATSAPP: Não coloque credenciais no motivo'; end if;
    secret_changed:=changed_host or creds is distinct from previous;
    k:=vault.create_secret(creds::text);
    insert into platform_whatsapp_integrations(provider,url,secret_id,instance_name,enabled,revision)
      values(p_data->>'provider',p_data->>'url',k,'mj-platform-'||replace(gen_random_uuid()::text,'-',''),false,1)
      on conflict(provider) do update set url=excluded.url,secret_id=k,
        instance_name=case when changed_host then excluded.instance_name else old.instance_name end,
        enabled=case when secret_changed then false else old.enabled end,
        revision=old.revision+1,probe_ok=case when secret_changed then false else old.probe_ok end,
        state=case when changed_host then 'unknown' else old.state end,
        provision_state=case when changed_host then 'none' else old.provision_state end,updated_at=now();
    if changed_host and p_data->>'provider'='evolution_api' then
      update venue_whatsapp_instances set instance_name='mj-'||replace(gen_random_uuid()::text,'-',''),state='unknown',updated_at=now();
    end if;
  elsif p_action='enable' then
    if old.provider is null or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'WHATSAPP: Configuração inválida'; end if;
    if (p_data->>'enabled')::boolean and not old.probe_ok then raise exception 'WHATSAPP: Teste o acesso antes de ativar'; end if;
    if (p_data->>'enabled')::boolean and old.provider='evolution_go' and old.state<>'open' then raise exception 'WHATSAPP: Conecte o número Go antes de ativar'; end if;
    update platform_whatsapp_integrations set enabled=(p_data->>'enabled')::boolean,revision=revision+1,updated_at=now() where provider=old.provider;
  elsif p_action='probe' then
    if old.provider is null or p_data->>'state' not in('unknown','connecting','open','close') or jsonb_typeof(p_data->'ok') is distinct from 'boolean' then raise exception 'WHATSAPP: Resultado inválido'; end if;
    update platform_whatsapp_integrations set probe_ok=(p_data->>'ok')::boolean,state=p_data->>'state',tested_at=now(),
      provision_state=case when (p_data->>'provisioned')::boolean is true then 'created' else provision_state end where provider=old.provider;
  elsif p_action='claim_create' then
    if old.provider is null or old.provision_state<>'none' then raise exception 'WHATSAPP: Criação já iniciada. Consulte a instância antes de repetir'; end if;
    update platform_whatsapp_integrations set provision_state='creating' where provider=old.provider;
  elsif p_action='finish_create' then
    if p_data->>'status' not in('created','uncertain') then raise exception 'WHATSAPP: Estado de criação inválido'; end if;
    update platform_whatsapp_integrations set provision_state=p_data->>'status' where provider=old.provider and provision_state='creating';
  else raise exception 'WHATSAPP: Ação inválida'; end if;
  insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value)
    select a,'whatsapp_'||p_action,provider,coalesce(nullif(why,''),'Consulta técnica da integração WhatsApp'),jsonb_build_object('provider',provider,'url',url,'enabled',enabled,'revision',revision,'state',state,'probeOk',probe_ok) from platform_whatsapp_integrations where provider=p_data->>'provider';
  return '{}';
end $$;
revoke all on function public.platform_whatsapp_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_whatsapp_service(text,jsonb) to service_role;
