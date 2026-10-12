grant select on shop_orders to service_role;
create unique index shop_external_charge on shop_orders(gateway_id,external_id) where external_id is not null;
alter function public.shop_action(text,jsonb) rename to shop_action_core;
revoke all on function public.shop_action_core(text,jsonb) from public,anon,authenticated;
create function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();s uuid;result jsonb;v jsonb;
begin
 if me is null then raise exception 'LOJA:Entre com uma conta ativa';end if;
 if p_action='gateway_disconnect' then
  s:=(p_data->>'sellerId')::uuid;if not public.shop_manager(s,me) or length(coalesce(p_data->>'reason',''))<8 then raise exception 'LOJA:Desativação exige responsável e motivo';end if;
  update shop_gateways set enabled=false where seller_id=s;
  insert into shop_events(seller_id,actor_id,action,detail) values(s,me,'gateway_disconnected',p_data->>'reason');return '{}';
 elsif p_action='product_archive' then
  select seller_id into s from shop_products where id=(p_data->>'id')::uuid;
  if not public.shop_manager(s,me) then raise exception 'LOJA:Produto indisponível';end if;
  update shop_products set active=false,revision=revision+1 where id=(p_data->>'id')::uuid;return '{}';
 elsif p_action='product_save' then
  for v in select value from jsonb_array_elements(p_data->'variants') loop
   if length(coalesce(v->>'size',''))>60 or length(coalesce(v->>'color',''))>60 or (v->>'stock')::integer>1000000 then raise exception 'LOJA:Variação fora dos limites';end if;
  end loop;
 elsif p_action='prepare_order' and p_data->>'fulfillment'='delivery' then
  if length(coalesce(p_data->'address'->>'street',''))>200 or length(coalesce(p_data->'address'->>'city',''))>80 or length(coalesce(p_data->'address'->>'number',''))>20 or length(coalesce(p_data->'address'->>'complement',''))>120 then raise exception 'LOJA:Endereço fora dos limites';end if;
  p_data:=jsonb_set(p_data,'{address}',jsonb_build_object('cep',p_data->'address'->>'cep','street',p_data->'address'->>'street','number',p_data->'address'->>'number','complement',coalesce(p_data->'address'->>'complement',''),'city',p_data->'address'->>'city','state',p_data->'address'->>'state'));
 end if;
 result:=public.shop_action_core(p_action,p_data);return result;
end $$;
revoke all on function public.shop_action(text,jsonb) from public,anon;
grant execute on function public.shop_action(text,jsonb) to authenticated;

create function public.shop_cart(p_variants uuid[]) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin if cardinality(p_variants)>100 then raise exception 'LOJA:Carrinho fora do limite';end if;
select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'seller_id',p.seller_id,'seller_name',s.name,'seller_kind',s.kind,'name',p.name,'description',p.description,'category',p.category,'photos',p.photos,'active',p.active,'revision',p.revision,'sponsored',coalesce(p.featured_until>now(),false),
'variants',(select jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'size',v.size,'color',v.color,'price_cents',v.price_cents,'stock',v.stock,'active',v.active,'revision',v.revision,'cost_cents',null)) from shop_variants v where v.product_id=p.id and v.id=any(p_variants) and v.active))),'[]') into result
from shop_products p join shop_sellers s on s.id=p.seller_id where p.active and s.status='active' and exists(select 1 from shop_variants v where v.product_id=p.id and v.id=any(p_variants) and v.active);
return result;end $$;
revoke all on function public.shop_cart(uuid[]) from public;
grant execute on function public.shop_cart(uuid[]) to anon,authenticated;

alter function public.shop_service(text,jsonb) rename to shop_service_core;
revoke all on function public.shop_service_core(text,jsonb) from public,anon,authenticated,service_role;
create function public.shop_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin if p_action='review' then
 update shop_orders set status='payment_review',updated_at=now() where id=(p_data->>'orderId')::uuid and status not in ('refunded');
 insert into shop_events(order_id,action,detail) values((p_data->>'orderId')::uuid,'payment_review','Resultado do provedor exige revisão financeira; entrega bloqueada.');return '{}';
end if;return public.shop_service_core(p_action,p_data);end $$;
revoke all on function public.shop_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_service(text,jsonb) to service_role;
