create function credit_operating_tabs(v uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'transferred_cents',coalesce((select sum(amount_cents) from venue_credit_lines where tab_id=t.id),0),'balance_cents',greatest(0,
 coalesce((select round(sum(i.quantity*i.unit_price)*100) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=t.id and i.status<>'cancelled' and o.status<>'cancelled'),0)-coalesce((select round(sum(amount)*100) from sale_payments where tab_id=t.id and reversed_at is null),0)-coalesce((select sum(amount_cents) from venue_credit_lines where tab_id=t.id),0)))),'[]'::jsonb) from service_tabs t where establishment_id=v and status not in('closed','cancelled')$$;
do $$declare b text;begin
 b:=pg_get_functiondef('venue_snapshot(uuid)'::regprocedure);
 b:=replace(b,'if venue_can(v,''pdv'') then','if venue_can(v,''pdv'') then
 result:=result||jsonb_build_object(''tab_credit_balances'',credit_operating_tabs(v));');execute b;
end$$;
create table venue_credit_gateway_limits(actor uuid not null references players(id),minute timestamptz not null,hits int not null,primary key(actor,minute));
alter table venue_credit_gateway_limits enable row level security;revoke all on venue_credit_gateway_limits from anon,authenticated;
alter function credit_payment_service(text,jsonb) rename to credit_payment_service_core;
revoke all on function credit_payment_service_core(text,jsonb) from public,anon,authenticated;
create function credit_payment_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid;n int;begin
 if auth.role()<>'service_role' then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action='access' then
  select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;if not credit_actor_allowed(me) then raise exception 'FATURA: Conta não autorizada.';end if;
  delete from venue_credit_gateway_limits where minute<now()-interval '1 day';
  insert into venue_credit_gateway_limits values(me,date_trunc('minute',now()),1) on conflict(actor,minute) do update set hits=venue_credit_gateway_limits.hits+1 returning hits into n;
  if n>30 then raise exception 'FATURA: Muitas consultas ao provedor. Aguarde um minuto.';end if;return '{}';
 end if;
 return credit_payment_service_core(p_action,p_data);
end$$;
revoke all on function credit_operating_tabs(uuid),credit_payment_service(text,jsonb) from public,anon,authenticated;
grant execute on function credit_payment_service(text,jsonb) to service_role;
