-- Only authenticated, server-verified PSP results can reach these service-only RPCs.
alter table shop_orders add column refund_payment_id text;
create table public.shop_receipts (
 gateway_id uuid references shop_gateways(id), payment_id text, order_id uuid not null references shop_orders(id),
 status text not null check(status in ('approved','refunded','partial_refund','charged_back')),
 amount_cents integer not null, updated_at timestamptz not null, primary key(gateway_id,payment_id)
);
alter table shop_receipts enable row level security;
revoke all on shop_receipts from anon,authenticated;
create function public.shop_order(p_order uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();r jsonb;begin r:=public.shop_order_json(p_order,me);
if r is null then raise exception 'LOJA:Pedido indisponível';end if;
return r||jsonb_build_object('receipts',(select coalesce(jsonb_agg(jsonb_build_object('payment_id',payment_id,'status',status,'amount_cents',amount_cents)),'[]') from shop_receipts where order_id=p_order));end $$;
revoke all on function public.shop_order(uuid) from public,anon;
grant execute on function public.shop_order(uuid) to authenticated;

create function public.shop_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid;s shop_sellers;o shop_orders;g shop_gateways;secret uuid;r shop_receipts;paid_count integer;total_refunded integer;stamp timestamptz;pay_id text;
begin
 if p_data ? 'actor' then select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
  if me is null or exists(select 1 from platform_account_controls where player_id=me and suspended) then raise exception 'LOJA:Conta indisponível';end if;
 end if;
 if p_action='gateway_save' then
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid for update;
  if not public.shop_manager(s.id,me) or s.status<>'active' or jsonb_typeof(p_data->'credentials') is distinct from 'object' then raise exception 'LOJA:Vendedor não autorizado';end if;
  select vault.create_secret((p_data->'credentials')::text) into secret;
  update shop_gateways set enabled=false where seller_id=s.id;
  insert into shop_gateways(seller_id,provider,collector_id,secret_id,enabled) values(s.id,p_data->>'provider',p_data->>'collectorId',secret,true) returning * into g;
  insert into shop_events(seller_id,actor_id,action) values(s.id,me,'gateway_connected');return jsonb_build_object('id',g.id);
 elsif p_action='gateway_context' then
  select * into g from shop_gateways where id=(p_data->>'gatewayId')::uuid;
  if g.id is null then raise exception 'LOJA:Conexão indisponível';end if;
  return (to_jsonb(g)-'secret_id')||jsonb_build_object('credentials',(select decrypted_secret::jsonb from vault.decrypted_secrets where id=g.secret_id));
 end if;
 select * into o from shop_orders where id=(p_data->>'orderId')::uuid for update;
 if o.id is null then raise exception 'LOJA:Pedido indisponível';end if;
 select * into g from shop_gateways where id=o.gateway_id;
 if p_action in ('context','claim_checkout','claim_refund') and (me is null or (o.buyer_id<>me and not public.shop_manager(o.seller_id,me))) then raise exception 'LOJA:Sem permissão para o pedido';end if;
 if p_action='context' then return to_jsonb(o)||jsonb_build_object('gateway',to_jsonb(g)-'secret_id','credentials',(select decrypted_secret::jsonb from vault.decrypted_secrets where id=g.secret_id),'receipts',(select coalesce(jsonb_agg(to_jsonb(r0)),'[]') from shop_receipts r0 where r0.order_id=o.id));
 elsif p_action='claim_checkout' then
  if o.status<>'pending' or o.expires_at<now() or not g.enabled or o.buyer_id<>me then raise exception 'LOJA:Checkout indisponível';end if;
  if o.checkout_state<>'new' then return jsonb_build_object('claimed',false,'url',o.checkout_url);end if;
  update shop_orders set checkout_state='building',updated_at=now() where id=o.id;return jsonb_build_object('claimed',true);
 elsif p_action='checkout_save' then
  if o.checkout_state not in ('building','review') then raise exception 'LOJA:Estado de checkout inválido';end if;
  update shop_orders set external_id=p_data->>'externalId',checkout_url=p_data->>'url',pix_code=p_data->>'pixCode',checkout_state='ready',updated_at=now() where id=o.id;return '{}';
 elsif p_action='claim_refund' then
  if not public.shop_manager(o.seller_id,me) or length(coalesce(p_data->>'reason','')) not between 8 and 500 then raise exception 'LOJA:Reembolso exige vendedor e motivo';end if;
  pay_id:=coalesce(p_data->>'paymentId',o.payment_id);
  select * into r from shop_receipts where gateway_id=g.id and payment_id=pay_id and order_id=o.id and status='approved';
  if r.payment_id is null then raise exception 'LOJA:Pagamento não permite reembolso integral automático; reconcilie primeiro';end if;
  if o.refund_building then return jsonb_build_object('claimed',false);end if;
  update shop_orders set status='refund_pending',refund_payment_id=pay_id,refund_building=true,refund_restock=coalesce((p_data->>'restock')::boolean,false),refund_reason=p_data->>'reason',updated_at=now() where id=o.id;
  insert into shop_events(order_id,seller_id,actor_id,action,detail) values(o.id,o.seller_id,me,'refund_approved',p_data->>'reason');return jsonb_build_object('claimed',true,'paymentId',pay_id);
 elsif p_action='settle' then
  if g.id is distinct from (p_data->>'gatewayId')::uuid or (p_data->>'amountCents')::integer is distinct from o.total_cents or p_data->>'currency' is distinct from 'BRL' then raise exception 'LOJA:Valor, moeda ou destinatário divergentes';end if;
  pay_id:=p_data->>'paymentId';stamp:=(p_data->>'updatedAt')::timestamptz;
  if pay_id is null or length(pay_id)>100 or stamp is null or p_data->>'status' not in ('approved','refunded','partial_refund','charged_back') then raise exception 'LOJA:Resultado de pagamento inválido';end if;
  select * into r from shop_receipts where gateway_id=g.id and payment_id=pay_id for update;
  if r.order_id is not null and r.order_id<>o.id then raise exception 'LOJA:Pagamento vinculado a outro pedido';end if;
  if r.payment_id is not null and (r.updated_at>stamp or (r.status='refunded' and p_data->>'status'='approved')) then return '{}';end if;
  insert into shop_receipts values(g.id,pay_id,o.id,p_data->>'status',o.total_cents,stamp) on conflict(gateway_id,payment_id) do update set status=excluded.status,updated_at=excluded.updated_at;
  select count(*) into paid_count from shop_receipts where order_id=o.id and status='approved';
  if p_data->>'status'='approved' then
   if paid_count>1 or o.stock_released or o.status='cancelled' or (o.status='pending' and o.expires_at<now()) then
    update shop_orders set status='payment_review',payment_id=coalesce(payment_id,pay_id),payment_updated_at=stamp,updated_at=now() where id=o.id;
   elsif o.status='pending' then
    update shop_orders set status='paid',payment_id=pay_id,payment_updated_at=stamp,commission_state=case when commission_cents>0 then 'owed' else 'pending' end,provider_fee_cents=nullif(p_data->>'feeCents','')::integer,updated_at=now() where id=o.id;
    insert into shop_events(order_id,action,detail) values(o.id,'paid','Pagamento confirmado por consulta autenticada ao provedor.');
   end if;
  elsif p_data->>'status'='refunded' and paid_count=0 and not exists(select 1 from shop_receipts where order_id=o.id and status in ('partial_refund','charged_back')) then
   if o.refund_restock then perform public.shop_release(o.id);end if;
   update shop_orders set status='refunded',commission_state='reversed',refund_building=false,payment_updated_at=stamp,updated_at=now() where id=o.id;
   if o.status<>'refunded' then insert into shop_events(order_id,action,detail) values(o.id,'refunded','Reembolso integral confirmado no provedor.');end if;
  else
   update shop_orders set status='payment_review',refund_building=case when refund_payment_id=pay_id then false else refund_building end,payment_updated_at=stamp,updated_at=now() where id=o.id;
  end if;
  return jsonb_build_object('orderId',o.id);
 end if;
 raise exception 'LOJA:Ação de serviço inválida';end $$;
revoke all on function public.shop_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_service(text,jsonb) to service_role;
grant execute on function public.shop_expire() to service_role;
do $$begin if to_regprocedure('cron.schedule(text,text,text)') is not null then
 perform cron.schedule('shop-stock-expiration','*/5 * * * *','select public.shop_expire();');
end if;end $$;

create function public.shop_upload_allowed() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.community_chat_me() is not null and (public.shop_admin(public.community_chat_me()) or exists(select 1 from shop_sellers where owner_player_id=public.community_chat_me()))
$$;
revoke all on function public.shop_upload_allowed() from public,anon;
grant execute on function public.shop_upload_allowed() to authenticated;
-- PGlite fixtures omit Storage; production uses the Supabase bucket and policies.
do $$begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('shop-media','shop-media',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
 execute $p$create policy shop_media_read on storage.objects for select to anon,authenticated using(bucket_id='shop-media')$p$;
 execute $p$create policy shop_media_insert on storage.objects for insert to authenticated with check(bucket_id='shop-media' and (storage.foldername(name))[1]=auth.uid()::text and public.shop_upload_allowed())$p$;
 end if;end $$;
