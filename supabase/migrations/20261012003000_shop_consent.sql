-- Buyer acceptance and a preflight that authorizes the seller before any PSP call.
alter table shop_orders add column buyer_terms_version text;
alter table shop_orders add column buyer_terms_at timestamptz;
alter function public.shop_action(text,jsonb) rename to shop_action_validated;
revoke all on function public.shop_action_validated(text,jsonb) from public,anon,authenticated;
create function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if p_action='prepare_order' then
  if p_data->>'termsVersion' is distinct from 'shop-buy-v1' or not coalesce((p_data->>'consent')::boolean,false) then raise exception 'LOJA:Confirme os itens, vendedor e condições de entrega';end if;
 end if;
 if p_action='sponsor' and (length(coalesce(p_data->>'reason',''))>500 or length(coalesce(p_data->>'reference',''))>160) then raise exception 'LOJA:Acordo fora dos limites';end if;
 if p_action in ('seller_create','seller_save') and (length(coalesce(p_data->>'phone',''))>30 or length(coalesce(p_data->>'pickupAddress',''))>500) then raise exception 'LOJA:Dados comerciais fora dos limites';end if;
 result:=public.shop_action_validated(p_action,p_data);
 if p_action='prepare_order' then update shop_orders set buyer_terms_version='shop-buy-v1',buyer_terms_at=coalesce(buyer_terms_at,now()) where id=(result->>'id')::uuid and buyer_terms_version is null;end if;
 return result;
end $$;
revoke all on function public.shop_action(text,jsonb) from public,anon;
grant execute on function public.shop_action(text,jsonb) to authenticated;
-- Numeric arithmetic must not overflow for larger baskets before commission rounding.
do $$declare source text;begin
 source:=pg_get_functiondef('public.shop_action_core(text,jsonb)'::regprocedure);
 if position('round(total*s.commission_bps/10000.0)' in source)=0 then raise exception 'Unexpected shop_action_core definition';end if;
 execute replace(source,'round(total*s.commission_bps/10000.0)','round(total::numeric*s.commission_bps/10000.0)');
end $$;
create or replace function public.shop_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid;s shop_sellers;begin
 if p_action='seller_access' then
  select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid;
  if s.id is null or not public.shop_manager(s.id,me) or s.status<>'active' then raise exception 'LOJA:Vendedor não autorizado';end if;return '{}';
 elsif p_action='review' then
  update shop_orders set status='payment_review',updated_at=now() where id=(p_data->>'orderId')::uuid and status<>'refunded';
  if found then insert into shop_events(order_id,action,detail) values((p_data->>'orderId')::uuid,'payment_review','Resultado do provedor exige revisão financeira; entrega bloqueada.');end if;return '{}';
 end if;return public.shop_service_core(p_action,p_data);
end $$;
revoke all on function public.shop_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_service(text,jsonb) to service_role;
