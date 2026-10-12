-- Authentication of merchant credentials is not approval to accept live payments.
do $$declare source text;begin
 source:=pg_get_functiondef('public.shop_service_core(text,jsonb)'::regprocedure);
 if position('p_data->>''collectorId'',secret,true)' in source)=0 then raise exception 'Unexpected gateway_save definition';end if;
 execute replace(source,'p_data->>''collectorId'',secret,true)','p_data->>''collectorId'',secret,false)');
 source:=pg_get_functiondef('public.shop_snapshot(text,text,uuid,integer)'::regprocedure);
 if position('jsonb_build_object(''provider'',g.provider,''enabled'',g.enabled)' in source)=0 then raise exception 'Unexpected shop_snapshot definition';end if;
 execute replace(source,'jsonb_build_object(''provider'',g.provider,''enabled'',g.enabled)','jsonb_build_object(''provider'',g.provider,''enabled'',g.enabled,''id'',case when public.shop_manager(s.id,me) then g.id else null end)');
end $$;
create or replace function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;me uuid:=public.community_chat_me();g shop_gateways;begin
 if p_action='gateway_enable' then
  if me is null or not public.shop_admin(me) or not coalesce((p_data->>'verified')::boolean,false) or length(coalesce(p_data->>'reason','')) not between 8 and 500 then raise exception 'LOJA:Liberação exige administrador, homologação confirmada e motivo';end if;
  select * into g from shop_gateways where id=(p_data->>'id')::uuid for update;
  if g.id is null or not exists(select 1 from shop_sellers where id=g.seller_id and status='active') then raise exception 'LOJA:Conexão ou vendedor indisponível';end if;
  if exists(select 1 from shop_gateways where seller_id=g.seller_id and created_at>g.created_at) then raise exception 'LOJA:Use a conexão mais recente';end if;
  update shop_gateways set enabled=false where seller_id=g.seller_id and id<>g.id;
  update shop_gateways set enabled=true where id=g.id;
  insert into shop_events(seller_id,actor_id,action,detail) values(g.seller_id,me,'gateway_homologated',p_data->>'reason');return '{}';
 end if;
 if p_action='prepare_order' then
  if p_data->>'termsVersion' is distinct from 'shop-buy-v1' or not coalesce((p_data->>'consent')::boolean,false) then raise exception 'LOJA:Confirme os itens, vendedor e condições de entrega';end if;
 end if;
 if p_action='commission_received' and not exists(select 1 from shop_orders where id=(p_data->>'id')::uuid and status in ('paid','ready','shipped','delivered')) then raise exception 'LOJA:Comissão exige pedido com pagamento sem revisão';end if;
 if p_action='sponsor' and (length(coalesce(p_data->>'reason',''))>500 or length(coalesce(p_data->>'reference',''))>160) then raise exception 'LOJA:Acordo fora dos limites';end if;
 if p_action in ('seller_create','seller_save') and (length(coalesce(p_data->>'phone',''))>30 or length(coalesce(p_data->>'pickupAddress',''))>500) then raise exception 'LOJA:Dados comerciais fora dos limites';end if;
 result:=public.shop_action_validated(p_action,p_data);
 if p_action='prepare_order' then update shop_orders set buyer_terms_version='shop-buy-v1',buyer_terms_at=coalesce(buyer_terms_at,now()) where id=(result->>'id')::uuid and buyer_terms_version is null;end if;
 return result;
end $$;
revoke all on function public.shop_action(text,jsonb) from public,anon;
grant execute on function public.shop_action(text,jsonb) to authenticated;
