-- Loja física independente das comandas. Valores em centavos, sem carteira fictícia.
create table public.shop_sellers (
 id uuid primary key default gen_random_uuid(), owner_player_id uuid not null references players(id),
 name text not null check(length(name) between 3 and 120), kind text not null check(kind in ('official','partner')),
 status text not null default 'pending' check(status in ('pending','active','suspended','declined')),
 phone text not null default '', pickup_address text not null default '', pickup_enabled boolean not null default true,
 delivery_enabled boolean not null default false, delivery_fee_cents integer not null default 0 check(delivery_fee_cents between 0 and 100000),
 cep_prefixes text[] not null default '{}', commission_bps integer not null default 0 check(commission_bps between 0 and 3000),
 terms_version text not null, terms_at timestamptz not null default now(), revision integer not null default 1,
 created_at timestamptz not null default now(), check(pickup_enabled or delivery_enabled)
);
create unique index shop_one_official on shop_sellers(kind) where kind='official';
create table public.shop_products (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references shop_sellers(id),
 name text not null check(length(name) between 3 and 160), description text not null default '' check(length(description)<=4000),
 category text not null check(category in ('ball','uniform','vest','boots','equipment','other')),
 photos text[] not null default '{}', active boolean not null default false,
 featured_until timestamptz, sponsorship_cents integer not null default 0, sponsorship_reference text,
 revision integer not null default 1, created_at timestamptz not null default now(), check(cardinality(photos)<=5)
);
create table public.shop_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references shop_products(id),
 sku text not null check(length(sku) between 1 and 60), size text not null default '', color text not null default '',
 price_cents integer not null check(price_cents between 1 and 100000000), cost_cents integer not null default 0 check(cost_cents>=0),
 stock integer not null default 0 check(stock>=0), active boolean not null default true, revision integer not null default 1,
 unique(product_id,sku)
);
create table public.shop_gateways (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references shop_sellers(id),
 provider text not null check(provider in ('mercado_pago','picpay')), collector_id text not null,
 secret_id uuid not null, enabled boolean not null default false, created_at timestamptz not null default now()
);
create unique index shop_active_gateway on shop_gateways(seller_id) where enabled;
create table public.shop_orders (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references shop_sellers(id), buyer_id uuid not null references players(id),
 nonce uuid not null, gateway_id uuid not null references shop_gateways(id),
 status text not null default 'pending' check(status in ('pending','paid','ready','shipped','delivered','cancelled','refund_pending','refunded','payment_review')),
 fulfillment text not null check(fulfillment in ('pickup','delivery')), address jsonb, customer_phone text not null,
 pickup_address text not null, subtotal_cents integer not null, shipping_cents integer not null, total_cents integer not null,
 commission_cents integer not null, commission_state text not null default 'pending' check(commission_state in ('pending','owed','received','reversed')),
 commission_reference text, provider_fee_cents integer, payment_id text, payment_updated_at timestamptz,
 checkout_state text not null default 'new' check(checkout_state in ('new','building','ready','review')),
 checkout_url text, external_id text, pix_code text, stock_released boolean not null default false,
 refund_reason text, refund_requested_at timestamptz, refund_building boolean not null default false, refund_restock boolean not null default false,
 tracking text, carrier text, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
 updated_at timestamptz not null default now(), unique(buyer_id,nonce), check(total_cents=subtotal_cents+shipping_cents), check(total_cents>0)
);
create unique index shop_order_provider_payment on shop_orders(gateway_id,payment_id) where payment_id is not null;
create table public.shop_order_lines (
 order_id uuid references shop_orders(id), variant_id uuid references shop_variants(id),
 product_name text not null, sku text not null, size text not null, color text not null,
 quantity integer not null check(quantity between 1 and 99), unit_cents integer not null, cost_cents integer not null,
 primary key(order_id,variant_id)
);
create table public.shop_events (
 id bigint generated always as identity primary key, order_id uuid references shop_orders(id), seller_id uuid references shop_sellers(id),
 actor_id uuid references players(id), action text not null, detail text not null default '', created_at timestamptz not null default now()
);
create index shop_order_seller_created on shop_orders(seller_id,created_at desc);
create index shop_order_buyer_created on shop_orders(buyer_id,created_at desc);
create index shop_products_catalog on shop_products(seller_id,active,created_at desc);
do $$declare t text;begin foreach t in array array['shop_sellers','shop_products','shop_variants','shop_gateways','shop_orders','shop_order_lines','shop_events'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t);
end loop;end $$;

create function public.shop_admin(p_me uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from platform_admin_accounts a join players p on p.auth_user_id=a.auth_user_id where p.id=p_me and a.active and a.role in ('owner','admin'))
 and not exists(select 1 from platform_account_controls where player_id=p_me and suspended)
$$;
create function public.shop_manager(p_seller uuid,p_me uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_me is not null and (public.shop_admin(p_me) or exists(select 1 from shop_sellers where id=p_seller and owner_player_id=p_me))
 and not exists(select 1 from platform_account_controls where player_id=p_me and suspended)
$$;
create function public.shop_order_json(p_order uuid,p_me uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select (to_jsonb(o)-array['nonce','gateway_id','refund_building','refund_restock']-case when public.shop_manager(o.seller_id,p_me) then array[]::text[] else array['commission_reference','commission_state','commission_cents','provider_fee_cents'] end)||jsonb_build_object(
 'seller_name',s.name,'seller_phone',s.phone,'buyer_name',p.name,'can_manage',public.shop_manager(o.seller_id,p_me),
 'provider',g.provider,'lines',(select coalesce(jsonb_agg(to_jsonb(l)-case when public.shop_manager(o.seller_id,p_me) then array['order_id'] else array['order_id','cost_cents'] end),'[]') from shop_order_lines l where l.order_id=o.id),
 'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'detail',e.detail,'created_at',e.created_at) order by e.id),'[]') from shop_events e where e.order_id=o.id and (public.shop_manager(o.seller_id,p_me) or e.action not in ('commission_received','refund_approved'))))
 from shop_orders o join shop_sellers s on s.id=o.seller_id join players p on p.id=o.buyer_id join shop_gateways g on g.id=o.gateway_id
 where o.id=p_order and (o.buyer_id=p_me or public.shop_manager(o.seller_id,p_me))
$$;
create function public.shop_release(p_order uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare o shop_orders;l record;begin select * into o from shop_orders where id=p_order for update;
 if o.id is null or o.stock_released then return;end if;
 for l in select * from shop_order_lines where order_id=o.id order by variant_id loop update shop_variants set stock=stock+l.quantity,revision=revision+1 where id=l.variant_id;end loop;
 update shop_orders set stock_released=true where id=o.id;
 end $$;
create function public.shop_expire() returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare o record;begin for o in select id from shop_orders where status='pending' and expires_at<now() order by id for update skip locked limit 100 loop
 perform public.shop_release(o.id); update shop_orders set status='cancelled',updated_at=now() where id=o.id;
 insert into shop_events(order_id,action,detail) values(o.id,'cancelled','Prazo do checkout encerrado. Pagamento tardio será tratado em revisão, sem reservar estoque novamente.');
 end loop;end $$;

create function public.shop_snapshot(p_mode text default 'catalog',p_query text default '',p_seller uuid default null,p_offset integer default 0) returns jsonb
 language plpgsql security definer set search_path=public,pg_temp as $$
 declare me uuid:=public.community_chat_me(); admin boolean:=coalesce(public.shop_admin(me),false); result jsonb; catalog jsonb; sellers jsonb;
 begin
 if length(coalesce(p_query,''))>160 or p_offset not between 0 and 100000 then raise exception 'LOJA:Busca inválida';end if;
 if p_mode not in ('catalog','manage') then raise exception 'LOJA:Consulta inválida';end if;
 if p_mode='manage' and me is null then raise exception 'LOJA:Entre na sua conta';end if;
 -- Lazy expiration is idempotent and never marks a payment as approved.
 if me is not null then perform public.shop_expire();end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind,'status',s.status,'phone',s.phone,
 'pickup_address',s.pickup_address,'pickup_enabled',s.pickup_enabled,'delivery_enabled',s.delivery_enabled,'delivery_fee_cents',s.delivery_fee_cents,
 'cep_prefixes',s.cep_prefixes,'revision',s.revision,'can_manage',public.shop_manager(s.id,me),
 'commission_bps',case when public.shop_manager(s.id,me) then s.commission_bps else null end,
 'gateway',(select jsonb_build_object('provider',g.provider,'enabled',g.enabled) from shop_gateways g where g.seller_id=s.id order by g.created_at desc limit 1))), '[]') into sellers
 from shop_sellers s where (p_mode='catalog' and s.status='active') or (p_mode='manage' and public.shop_manager(s.id,me));
 select coalesce(jsonb_agg(row),'[]') into catalog from (
 select jsonb_build_object('id',p.id,'seller_id',p.seller_id,'seller_name',s.name,'seller_kind',s.kind,'name',p.name,'description',p.description,'category',p.category,
 'photos',p.photos,'active',p.active,'revision',p.revision,'sponsored',coalesce(p.featured_until>now(),false),
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'size',v.size,'color',v.color,'price_cents',v.price_cents,'stock',v.stock,'active',v.active,'revision',v.revision,
 'cost_cents',case when p_mode='manage' then v.cost_cents else null end) order by v.sku),'[]') from shop_variants v where v.product_id=p.id and (p_mode='manage' or v.active))) row
 from shop_products p join shop_sellers s on s.id=p.seller_id
 where ((p_mode='catalog' and p.active and s.status='active') or (p_mode='manage' and public.shop_manager(s.id,me)))
 and (p_seller is null or p.seller_id=p_seller) and (p_query='' or position(lower(p_query) in lower(p.name||' '||s.name||' '||p.description))>0)
 order by (coalesce(p.featured_until>now(),false)) desc,p.created_at desc,p.id limit 40 offset p_offset) q;
 result:=jsonb_build_object('admin',admin,'sellers',sellers,'products',catalog,'offset',p_offset,'orders','[]'::jsonb);
 if me is not null then result:=result||jsonb_build_object('orders',(select coalesce(jsonb_agg(public.shop_order_json(id,me)),'[]') from (select id from shop_orders o
 where (p_mode='catalog' and o.buyer_id=me) or (p_mode='manage' and public.shop_manager(o.seller_id,me)) order by created_at desc limit 100) q));end if;
 return result;end $$;

create function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare me uuid:=public.community_chat_me(); admin boolean:=coalesce(public.shop_admin(me),false); s shop_sellers;p shop_products;v shop_variants;o shop_orders;
 item jsonb; ids uuid[]:='{}'; key uuid; total integer:=0; fee integer:=0; n integer; request_nonce uuid; g shop_gateways; reason text:=btrim(coalesce(p_data->>'reason',''));
 begin
 if me is null then raise exception 'LOJA:Entre com uma conta ativa';end if;
 perform pg_advisory_xact_lock(hashtext('shop-user:'||me::text));
 if p_action='seller_create' then
  if p_data->>'termsVersion' is distinct from 'shop-v1' or not coalesce((p_data->>'consent')::boolean,false) then raise exception 'LOJA:Confirme os termos de vendedor e a publicação dos dados comerciais';end if;
  if p_data->>'kind'='official' and not admin then raise exception 'LOJA:Somente a plataforma cria a loja oficial';end if;
  if (select count(*) from shop_sellers where owner_player_id=me)>=5 then raise exception 'LOJA:Limite de lojas atingido';end if;
  insert into shop_sellers(owner_player_id,name,kind,status,phone,pickup_address,terms_version) values(me,btrim(p_data->>'name'),case when admin and p_data->>'kind'='official' then 'official' else 'partner' end,
   case when admin and p_data->>'kind'='official' then 'active' else 'pending' end,coalesce(p_data->>'phone',''),coalesce(p_data->>'pickupAddress',''),'shop-v1') returning * into s;
  insert into shop_events(seller_id,actor_id,action,detail) values(s.id,me,'seller_created',s.kind);return jsonb_build_object('id',s.id);
 elsif p_action in ('seller_save','seller_review') then
  select * into s from shop_sellers where id=(p_data->>'id')::uuid for update;
  if s.id is null or not public.shop_manager(s.id,me) or (p_data->>'revision')::integer is distinct from s.revision then raise exception 'LOJA:Loja indisponível ou alterada; atualize';end if;
  if p_action='seller_review' then
   if not admin or length(reason) not between 8 and 500 or p_data->>'status' not in ('active','suspended','declined') then raise exception 'LOJA:Revisão administrativa exige autorização e motivo';end if;
   if (p_data->>'commissionBps')::integer not between 0 and 3000 then raise exception 'LOJA:Comissão inválida';end if;
   update shop_sellers set status=p_data->>'status',commission_bps=case when kind='official' then 0 else (p_data->>'commissionBps')::integer end,revision=revision+1 where id=s.id;
  else
   if length(coalesce(p_data->>'phone',''))>30 or length(coalesce(p_data->>'pickupAddress',''))>500 then raise exception 'LOJA:Dados comerciais inválidos';end if;
   if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'cepPrefixes','[]')) x where x !~ '^[0-9]{3,8}$') then raise exception 'LOJA:Use prefixos de CEP com 3 a 8 dígitos';end if;
   update shop_sellers set name=btrim(p_data->>'name'),phone=coalesce(p_data->>'phone',''),pickup_address=coalesce(p_data->>'pickupAddress',''),
    pickup_enabled=coalesce((p_data->>'pickupEnabled')::boolean,true),delivery_enabled=coalesce((p_data->>'deliveryEnabled')::boolean,false),delivery_fee_cents=coalesce((p_data->>'deliveryFeeCents')::integer,0),
    cep_prefixes=array(select jsonb_array_elements_text(coalesce(p_data->'cepPrefixes','[]'))),revision=revision+1 where id=s.id;
  end if;
  insert into shop_events(seller_id,actor_id,action,detail) values(s.id,me,p_action,reason);return jsonb_build_object('id',s.id);
 elsif p_action='product_save' then
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid for update;
  if s.id is null or not public.shop_manager(s.id,me) then raise exception 'LOJA:Sem permissão para este catálogo';end if;
  if jsonb_typeof(p_data->'variants') is distinct from 'array' or jsonb_array_length(p_data->'variants') not between 1 and 30 then raise exception 'LOJA:Informe de 1 a 30 variações';end if;
  if jsonb_array_length(coalesce(p_data->'photos','[]'))>5 or exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'photos','[]')) u where u !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'LOJA:Use fotos enviadas à galeria da loja';end if;
  key:=nullif(p_data->>'id','')::uuid;
  if key is not null then select * into p from shop_products where id=key and seller_id=s.id for update;
   if p.id is null or (p_data->>'revision')::integer is distinct from p.revision then raise exception 'LOJA:Produto alterado; atualize antes de salvar';end if;
   update shop_products set name=btrim(p_data->>'name'),description=coalesce(p_data->>'description',''),category=p_data->>'category',photos=array(select jsonb_array_elements_text(coalesce(p_data->'photos','[]'))),
    active=coalesce((p_data->>'active')::boolean,false),revision=revision+1 where id=key returning * into p;
  else insert into shop_products(seller_id,name,description,category,photos,active) values(s.id,btrim(p_data->>'name'),coalesce(p_data->>'description',''),p_data->>'category',array(select jsonb_array_elements_text(coalesce(p_data->'photos','[]'))),coalesce((p_data->>'active')::boolean,false)) returning * into p;end if;
  for item in select value from jsonb_array_elements(p_data->'variants') loop
   key:=nullif(item->>'id','')::uuid;
   if key is not null then select * into v from shop_variants where id=key and product_id=p.id for update;
    if v.id is null or v.revision is distinct from (item->>'revision')::integer then raise exception 'LOJA:Estoque/variação alterados; atualize';end if;
    update shop_variants set sku=item->>'sku',size=coalesce(item->>'size',''),color=coalesce(item->>'color',''),price_cents=(item->>'priceCents')::integer,cost_cents=coalesce((item->>'costCents')::integer,0),stock=(item->>'stock')::integer,active=coalesce((item->>'active')::boolean,true),revision=revision+1 where id=key;
   else insert into shop_variants(product_id,sku,size,color,price_cents,cost_cents,stock,active) values(p.id,item->>'sku',coalesce(item->>'size',''),coalesce(item->>'color',''),(item->>'priceCents')::integer,coalesce((item->>'costCents')::integer,0),(item->>'stock')::integer,coalesce((item->>'active')::boolean,true)) returning id into key;end if;
   ids:=array_append(ids,key);
  end loop;
  update shop_variants set active=false,revision=revision+1 where product_id=p.id and not(id=any(ids));
  insert into shop_events(seller_id,actor_id,action,detail) values(s.id,me,'product_saved',p.name);return jsonb_build_object('id',p.id);
 elsif p_action='sponsor' then
  if not admin or length(reason)<8 or length(coalesce(p_data->>'reference',''))<3 then raise exception 'LOJA:Destaque exige confirmação administrativa e referência do acordo';end if;
  update shop_products set featured_until=(p_data->>'until')::timestamptz,sponsorship_cents=(p_data->>'amountCents')::integer,sponsorship_reference=p_data->>'reference',revision=revision+1 where id=(p_data->>'id')::uuid returning * into p;
  if p.id is null or (p_data->>'amountCents')::integer<0 or (p_data->>'until')::timestamptz>now()+interval '366 days' then raise exception 'LOJA:Destaque inválido';end if;
  insert into shop_events(seller_id,actor_id,action,detail) values(p.seller_id,me,'sponsor',reason);return jsonb_build_object('id',p.id);
 elsif p_action='prepare_order' then
  perform public.shop_expire();request_nonce:=(p_data->>'nonce')::uuid;
  if request_nonce is null then raise exception 'LOJA:Identificador obrigatório';end if;
  select * into o from shop_orders where buyer_id=me and shop_orders.nonce=request_nonce;
  if o.id is not null then if o.seller_id is distinct from (p_data->>'sellerId')::uuid then raise exception 'LOJA:Identificador já utilizado';end if;return public.shop_order_json(o.id,me);end if;
  if (select count(*) from shop_orders where buyer_id=me and created_at>now()-interval '1 hour')>=20 then raise exception 'LOJA:Aguarde antes de criar novos pedidos';end if;
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid and status='active' for update;
  if s.id is null then raise exception 'LOJA:Vendedor indisponível';end if;
  select * into g from shop_gateways where seller_id=s.id and enabled;
  if g.id is null then raise exception 'LOJA:O vendedor ainda não habilitou pagamentos homologados';end if;
  if p_data->>'fulfillment'='pickup' then if not s.pickup_enabled or length(s.pickup_address)<5 then raise exception 'LOJA:Retirada não configurada';end if;
  elsif p_data->>'fulfillment'='delivery' then
   if not s.delivery_enabled or coalesce(p_data->'address'->>'cep','') !~ '^\d{8}$' or length(coalesce(p_data->'address'->>'street',''))<3 or length(coalesce(p_data->'address'->>'number',''))<1 or length(coalesce(p_data->'address'->>'city',''))<2 or coalesce(p_data->'address'->>'state','') !~ '^[A-Z]{2}$' then raise exception 'LOJA:Entrega/endereço inválidos';end if;
   if cardinality(s.cep_prefixes)>0 and not exists(select 1 from unnest(s.cep_prefixes) x where (p_data->'address'->>'cep') like x||'%') then raise exception 'LOJA:CEP fora da área de entrega';end if;
   fee:=s.delivery_fee_cents;
  else raise exception 'LOJA:Escolha entrega ou retirada';end if;
  if length(coalesce(p_data->>'phone','')) not between 8 and 30 then raise exception 'LOJA:Informe telefone para este pedido';end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 25 then raise exception 'LOJA:Carrinho inválido';end if;
  -- Deterministic row locks and server-side price/stock resolution.
  for item in select value from jsonb_array_elements(p_data->'items') order by value->>'variantId' loop
   key:=(item->>'variantId')::uuid;n:=(item->>'quantity')::integer;
   if key is null or key=any(ids) or n is null or n not between 1 and 99 then raise exception 'LOJA:Quantidade/variação inválida';end if;
   select v0.* into v from shop_variants v0 join shop_products p0 on p0.id=v0.product_id where v0.id=key and p0.seller_id=s.id and p0.active and v0.active for update of v0;
   if v.id is null or v.stock<n then raise exception 'LOJA:Produto indisponível ou estoque insuficiente';end if;
   ids:=array_append(ids,key);total:=total+v.price_cents*n;
  end loop;
  insert into shop_orders(seller_id,buyer_id,nonce,gateway_id,fulfillment,address,customer_phone,pickup_address,subtotal_cents,shipping_cents,total_cents,commission_cents)
   values(s.id,me,request_nonce,g.id,p_data->>'fulfillment',case when p_data->>'fulfillment'='delivery' then p_data->'address' else null end,p_data->>'phone',s.pickup_address,total,fee,total+fee,round(total*s.commission_bps/10000.0)) returning * into o;
  for item in select value from jsonb_array_elements(p_data->'items') order by value->>'variantId' loop
   select * into v from shop_variants where id=(item->>'variantId')::uuid;select * into p from shop_products where id=v.product_id;n:=(item->>'quantity')::integer;
   insert into shop_order_lines values(o.id,v.id,p.name,v.sku,v.size,v.color,n,v.price_cents,v.cost_cents);
   update shop_variants set stock=stock-n,revision=revision+1 where id=v.id;
  end loop;
  insert into shop_events(order_id,seller_id,actor_id,action,detail) values(o.id,s.id,me,'pending','Estoque reservado por 30 minutos. Aguardando pagamento validado.');return public.shop_order_json(o.id,me);
 elsif p_action in ('cancel','refund_request','fulfill','commission_received','restock_return','refund_decline') then
  select * into o from shop_orders where id=(p_data->>'id')::uuid for update;
  if o.id is null or (o.buyer_id<>me and not public.shop_manager(o.seller_id,me)) then raise exception 'LOJA:Pedido indisponível';end if;
  if p_action='cancel' then
   if o.status<>'pending' then raise exception 'LOJA:Pedido pago exige solicitação de reembolso';end if;
   perform public.shop_release(o.id);update shop_orders set status='cancelled',updated_at=now() where id=o.id;
  elsif p_action='refund_request' then
   if o.status not in ('paid','ready','shipped','delivered','payment_review') or length(reason) not between 8 and 500 then raise exception 'LOJA:Informe motivo; este pedido não permite a solicitação';end if;
   update shop_orders set refund_reason=reason,refund_requested_at=now(),updated_at=now() where id=o.id;
  elsif p_action='restock_return' then
   if not public.shop_manager(o.seller_id,me) or o.status<>'refunded' or not coalesce((p_data->>'received')::boolean,false) or length(reason)<8 then raise exception 'LOJA:Confirme o recebimento físico da devolução';end if;
   perform public.shop_release(o.id);
  elsif p_action='refund_decline' then
   if not public.shop_manager(o.seller_id,me) or o.refund_requested_at is null or o.status in ('refund_pending','refunded') or length(reason)<8 then raise exception 'LOJA:Resposta de reembolso indisponível';end if;
   update shop_orders set refund_requested_at=null,refund_reason=reason,updated_at=now() where id=o.id;
  elsif p_action='commission_received' then
   if not admin or o.commission_state<>'owed' or length(coalesce(p_data->>'reference',''))<3 or length(reason)<8 then raise exception 'LOJA:Baixa exige confirmação administrativa e referência do recebimento';end if;
   update shop_orders set commission_state='received',commission_reference=p_data->>'reference',updated_at=now() where id=o.id;
  else
   if not public.shop_manager(o.seller_id,me) then raise exception 'LOJA:Somente o vendedor pode preparar a entrega';end if;
   if not((o.status='paid' and p_data->>'status'='ready') or (o.status in ('paid','ready') and o.fulfillment='delivery' and p_data->>'status'='shipped') or (o.status in ('paid','ready','shipped') and p_data->>'status'='delivered')) then raise exception 'LOJA:Transição de entrega inválida';end if;
   update shop_orders set status=p_data->>'status',tracking=left(p_data->>'tracking',160),carrier=left(p_data->>'carrier',80),updated_at=now() where id=o.id;
  end if;
  insert into shop_events(order_id,seller_id,actor_id,action,detail) values(o.id,o.seller_id,me,p_action,reason);return public.shop_order_json(o.id,me);
 end if;
 raise exception 'LOJA:Ação inválida';end $$;
revoke all on function public.shop_admin(uuid),public.shop_manager(uuid,uuid),public.shop_order_json(uuid,uuid),public.shop_release(uuid),public.shop_expire(),public.shop_snapshot(text,text,uuid,integer),public.shop_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_snapshot(text,text,uuid,integer) to anon,authenticated;
grant execute on function public.shop_action(text,jsonb) to authenticated;
