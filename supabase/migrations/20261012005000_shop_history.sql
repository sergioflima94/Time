-- Filter the managed store before the report limit; history uses a stable cursor.
do $$declare source text;begin
 source:=pg_get_functiondef('public.shop_snapshot(text,text,uuid,integer)'::regprocedure);
 execute replace(source,'where (p_mode=''catalog'' and o.buyer_id=me) or (p_mode=''manage'' and public.shop_manager(o.seller_id,me)) order by created_at desc limit 100)',
 'where ((p_mode=''catalog'' and o.buyer_id=me) or (p_mode=''manage'' and public.shop_manager(o.seller_id,me))) and (p_seller is null or o.seller_id=p_seller) order by created_at desc,id desc limit 100)');
end $$;
create function public.shop_orders_page(p_mode text default 'buyer',p_seller uuid default null,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();ids uuid[];result jsonb;begin
 if me is null or p_mode not in ('buyer','manage') then raise exception 'LOJA:Entre com uma conta ativa';end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'LOJA:Cursor inválido';end if;
 select array_agg(id order by created_at desc,id desc) into ids from (select id,created_at from shop_orders o
 where ((p_mode='buyer' and o.buyer_id=me) or (p_mode='manage' and public.shop_manager(o.seller_id,me))) and (p_seller is null or o.seller_id=p_seller)
 and (p_before is null or (o.created_at,o.id)<(p_before,p_before_id)) order by o.created_at desc,o.id desc limit 31) q;
 select coalesce(jsonb_agg(public.shop_order_json(id,me) order by ordinal),'[]') into result from unnest(ids[1:30]) with ordinality as q(id,ordinal);
 return jsonb_build_object('orders',result,'hasMore',coalesce(cardinality(ids)>30,false));
end $$;
revoke all on function public.shop_orders_page(text,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.shop_orders_page(text,uuid,timestamptz,uuid) to authenticated;
