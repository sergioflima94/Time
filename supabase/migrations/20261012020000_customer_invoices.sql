-- Conta por cliente/estabelecimento. Faturar NÃO é receber dinheiro.
create table public.venue_credit_accounts (
 id uuid primary key default gen_random_uuid(),establishment_id uuid not null references establishments(id),player_id uuid not null references players(id),
 enabled boolean not null default true,cut_day integer not null check(cut_day between 1 and 31),limit_cents integer not null check(limit_cents between 1 and 10000000),
 created_by uuid not null references players(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(establishment_id,player_id)
);
create table public.venue_credit_invoices (
 id uuid primary key default gen_random_uuid(),account_id uuid not null references venue_credit_accounts(id),cut_date date not null,created_at timestamptz not null default now(),unique(account_id,cut_date)
);
create table public.venue_credit_rentals (
 id uuid primary key default gen_random_uuid(),account_id uuid not null references venue_credit_accounts(id),booking_id uuid references field_bookings(id) on delete set null,service_date date not null,
 description text not null,amount_cents integer not null check(amount_cents between 1 and 10000000),
 status text not null default 'pending' check(status in('pending','billed','paid','cancelled')),
 created_by uuid not null references players(id),created_at timestamptz not null default now()
);
create unique index venue_credit_rental_occurrence on venue_credit_rentals(booking_id,service_date) where status<>'cancelled';
create table public.venue_credit_lines (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),kind text not null check(kind in('food','rental')),
 tab_id uuid unique references service_tabs(id),rental_id uuid unique references venue_credit_rentals(id),
 description text not null,amount_cents integer not null check(amount_cents between 1 and 10000000),
 accepted_by uuid not null references players(id),acceptance text not null check(acceptance in('app','counter')),posted_at timestamptz not null default now(),
 check((kind='food' and tab_id is not null and rental_id is null) or (kind='rental' and rental_id is not null and tab_id is null))
);
create table public.venue_credit_payments (
 id uuid primary key default gen_random_uuid(),invoice_id uuid references venue_credit_invoices(id),rental_id uuid unique references venue_credit_rentals(id),
 amount_cents integer not null check(amount_cents between 1 and 10000000),method text not null check(method in('cash','manual_pix')),
 reference text,received_by uuid not null references players(id),paid_at timestamptz not null default now(),
 check((invoice_id is null)<>(rental_id is null)),check(method='cash' or (reference is not null and length(trim(reference)) between 4 and 120))
);
create table public.venue_credit_allocations (
 payment_id uuid not null references venue_credit_payments(id),line_id uuid not null references venue_credit_lines(id),amount_cents integer not null check(amount_cents>0),primary key(payment_id,line_id)
);
create table public.venue_credit_requests (
 id uuid primary key,actor uuid not null references players(id),action text not null,request_data jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create index venue_credit_lines_invoice on venue_credit_lines(invoice_id,posted_at);
create index venue_credit_payments_invoice on venue_credit_payments(invoice_id,paid_at);
do $$declare t text;begin foreach t in array array['venue_credit_accounts','venue_credit_invoices','venue_credit_rentals','venue_credit_lines','venue_credit_payments','venue_credit_allocations','venue_credit_requests'] loop
 execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create function public.credit_cut_date(day_of_month integer,on_date date) returns date language plpgsql immutable set search_path=public,pg_temp as $$
declare first_day date:=date_trunc('month',on_date)::date;last_day date;result date;begin
 if day_of_month not between 1 and 31 then raise exception 'FATURA: Dia de corte inválido.';end if;
 last_day:=(first_day+interval '1 month'-interval '1 day')::date;result:=first_day+least(day_of_month,extract(day from last_day)::integer)-1;
 if on_date>result then first_day:=(first_day+interval '1 month')::date;last_day:=(first_day+interval '1 month'-interval '1 day')::date;result:=first_day+least(day_of_month,extract(day from last_day)::integer)-1;end if;return result;
end$$;
create function public.credit_balance(i uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i),0)-coalesce((select sum(amount_cents) from venue_credit_payments where invoice_id=i),0)
$$;
create function public.credit_account_balance(a uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(credit_balance(id)),0) from venue_credit_invoices where account_id=a
$$;
create function public.credit_tab_read(t uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select community_chat_me() is not null and exists(select 1 from service_tabs st where st.id=t and
 (venue_can(st.establishment_id,'pdv') or venue_can(st.establishment_id,'cash') or st.customer_player_id=community_chat_me()
 or exists(select 1 from tab_participants p where p.tab_id=t and p.player_id=community_chat_me())
 or exists(select 1 from venue_credit_lines l join venue_credit_invoices i on i.id=l.invoice_id join venue_credit_accounts a on a.id=i.account_id where l.tab_id=t and a.player_id=community_chat_me())))
$$;
drop policy if exists service_tabs_select_involved on service_tabs;
create policy service_tabs_select_involved on service_tabs for select to authenticated using(credit_tab_read(id));
-- Freeze only the financial source of a transferred tab. Kitchen fulfillment remains allowed.
create function public.credit_source_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare rowdata jsonb;afterdata jsonb;tab uuid;begin
 rowdata:=case when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end;
 afterdata:=case when tg_op<>'DELETE' then to_jsonb(new) end;
 if tg_op='UPDATE' and ((rowdata->'tab_id') is distinct from (afterdata->'tab_id') or
  (rowdata->'order_id') is distinct from (afterdata->'order_id') or
  (rowdata->'item_id') is distinct from (afterdata->'item_id') or
  (rowdata->'payment_id') is distinct from (afterdata->'payment_id')) then
  raise exception 'FATURA: Não é permitido transferir registros financeiros entre comandas.';
 end if;
 if tg_table_name in('sale_payments','sale_payment_intents','service_orders','tab_participants') then tab:=(rowdata->>'tab_id')::uuid;
 elsif tg_table_name='service_order_items' then select tab_id into tab from service_orders where id=(rowdata->>'order_id')::uuid;
 elsif tg_table_name='order_item_shares' then select o.tab_id into tab from service_order_items i join service_orders o on o.id=i.order_id where i.id=(rowdata->>'item_id')::uuid;
 elsif tg_table_name='sale_payment_allocations' then select tab_id into tab from sale_payments where id=(rowdata->>'payment_id')::uuid;
 elsif tg_table_name='service_tabs' then tab:=(rowdata->>'id')::uuid;
 end if;
 perform 1 from service_tabs where id=tab for update;
 if exists(select 1 from venue_credit_lines where tab_id=tab) then
  if tg_table_name='service_order_items' and tg_op='UPDATE' and afterdata->>'status' in('preparing','ready','delivered') and
   (to_jsonb(new)-'status')=(to_jsonb(old)-'status') then return new;end if;
  if tg_table_name='service_orders' and tg_op='UPDATE' and afterdata->>'status' in('preparing','ready','delivered') and
   (to_jsonb(new)-'status'-'completed_at')=(to_jsonb(old)-'status'-'completed_at') then return new;end if;
  if tg_table_name='service_tabs' and tg_op='UPDATE' and afterdata->>'status'='closed' and
   (to_jsonb(new)-'status'-'closed_at')=(to_jsonb(old)-'status'-'closed_at') then return new;end if;
  -- Preserve a genuine provider reversal, but flag it for owner review instead of inventing a new debt.
  if tg_table_name='sale_payments' and tg_op='UPDATE' and auth.role()='service_role' and afterdata->'reversed_at' is distinct from rowdata->'reversed_at' and
   (to_jsonb(new)-'reversed_at')=(to_jsonb(old)-'reversed_at') then
   insert into venue_notices(player_id,establishment_id,title,body) select e.owner_player_id,e.id,'Conferir estorno em comanda faturada','Houve estorno de um pagamento anterior. Confira a fatura; nenhum novo débito foi gerado automaticamente.' from service_tabs s join establishments e on e.id=s.establishment_id where s.id=tab;
   return new;
  end if;
  raise exception 'FATURA: Comanda faturada: o valor não pode ser cobrado ou alterado novamente.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
do $$declare t text;begin foreach t in array array['sale_payments','sale_payment_intents','sale_payment_allocations','service_orders','service_order_items','order_item_shares','tab_participants','service_tabs'] loop
 execute format('create trigger credit_source_guard before insert or update or delete on %I for each row execute function credit_source_guard()',t);end loop;end$$;
create function public.credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(i)||jsonb_build_object('venue_id',a.establishment_id,'venue_name',e.name,'customer_name',p.name,'player_id',a.player_id,
 'total_cents',coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i.id),0),'balance_cents',credit_balance(i.id),
 'status',case when credit_balance(i.id)=0 then case when i.cut_date>=(now() at time zone 'America/Sao_Paulo')::date then 'zero_open' else 'paid' end when i.cut_date<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' else 'open' end,
 'lines',coalesce((select jsonb_agg(l order by posted_at,id) from venue_credit_lines l where invoice_id=i.id),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount_cents',r.amount_cents,'method',r.method,'reference',r.reference,'paid_at',r.paid_at,'confirmation','counter')) from venue_credit_payments r where invoice_id=i.id),'[]'::jsonb))
 from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id join establishments e on e.id=a.establishment_id join players p on p.id=a.player_id where i.id=p_invoice
$$;
create function public.credit_snapshot(p_venue uuid default null,p_tab uuid default null,p_mode text default 'statement') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();v uuid:=p_venue;tab service_tabs;result jsonb;staff boolean;begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if p_mode not in('statement','directory','tab') then raise exception 'FATURA: Consulta inválida.';end if;
 if p_mode='directory' then
  if not venue_can(v,'pdv') then raise exception 'FATURA: Sem acesso ao PDV.';end if;
  return jsonb_build_object('customers',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'player_id',p.id,'name',p.name)) from venue_credit_accounts a join players p on p.id=a.player_id where a.establishment_id=v and a.enabled),'[]'::jsonb));
 end if;
 if p_mode='tab' then
  select * into tab from service_tabs where id=p_tab;v:=tab.establishment_id;
  if not credit_tab_read(p_tab) then raise exception 'FATURA: Sem acesso à comanda.';end if;
  return jsonb_build_object('venue_id',v,'me',me,'can_record',venue_can(v,'cash'),'tab_id',p_tab,
   'balance_cents',greatest(0,(select coalesce(round(sum(i.quantity*i.unit_price)*100),0) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=p_tab and i.status<>'cancelled')-(select coalesce(round(sum(amount)*100),0) from sale_payments where tab_id=p_tab and reversed_at is null)),
   'billed',(select to_jsonb(l)||jsonb_build_object('cut_date',i.cut_date,'customer_name',p.name,'invoice_balance_cents',credit_balance(i.id)) from venue_credit_lines l join venue_credit_invoices i on i.id=l.invoice_id join venue_credit_accounts a on a.id=i.account_id join players p on p.id=a.player_id where l.tab_id=p_tab),
   'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',p.name,'player_id',p.id,'cut_day',a.cut_day,'limit_cents',a.limit_cents,'balance_cents',credit_account_balance(a.id),'overdue',exists(select 1 from venue_credit_invoices i where i.account_id=a.id and i.cut_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(i.id)>0))) from venue_credit_accounts a join players p on p.id=a.player_id where a.establishment_id=v and a.enabled and (a.player_id=me or venue_can(v,'cash'))),'[]'::jsonb));
 end if;
 staff:=v is not null and (venue_can(v,'cash') or venue_can(v,'reports'));
 if v is not null and not staff and not exists(select 1 from venue_credit_accounts where establishment_id=v and player_id=me) then raise exception 'FATURA: Sem acesso às faturas deste estabelecimento.';end if;
 result:=jsonb_build_object('me',me,'owner',v is not null and is_establishment_owner(v),'can_record',v is not null and venue_can(v,'cash'),'can_offer',v is not null and (is_establishment_owner(v) or venue_can(v,'cash') and venue_can(v,'reservations')),
  'accounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',p.name,'venue_name',e.name,'balance_cents',credit_account_balance(a.id),'overdue',exists(select 1 from venue_credit_invoices i where i.account_id=a.id and i.cut_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(i.id)>0))) from venue_credit_accounts a join players p on p.id=a.player_id join establishments e on e.id=a.establishment_id where (v is null or a.establishment_id=v) and (a.player_id=me or staff)),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(credit_invoice_json(i.id) order by i.cut_date desc,i.id) from (select i.* from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id where (v is null or a.establishment_id=v) and (a.player_id=me or staff) order by i.cut_date desc,i.id limit 100)i),'[]'::jsonb),
  'rentals',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('customer_name',p.name,'venue_name',e.name,'venue_id',a.establishment_id,'payment',(select jsonb_build_object('amount_cents',r.amount_cents,'method',r.method,'paid_at',r.paid_at) from venue_credit_payments r where r.rental_id=q.id))) from venue_credit_rentals q join venue_credit_accounts a on a.id=q.account_id join players p on p.id=a.player_id join establishments e on e.id=a.establishment_id where (v is null or a.establishment_id=v) and (a.player_id=me or staff)),'[]'::jsonb));
 if staff then result:=result||jsonb_build_object('bookings',coalesce((select jsonb_agg(b) from (select id,team_name,date,day_of_week,recurrence,time,duration_minutes from field_bookings where establishment_id=v order by created_at desc limit 100)b),'[]'::jsonb));end if;return result;
end$$;
create function public.credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();v uuid;target uuid;account venue_credit_accounts;tab service_tabs;quote venue_credit_rentals;booking field_bookings;
 invoice venue_credit_invoices;prior venue_credit_requests;nonce uuid;result jsonb;amount bigint;balance bigint;pay uuid;line_id uuid;cut date;remaining integer;part integer;rowline record;
begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Dados inválidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador da operação obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into prior from venue_credit_requests where id=nonce;
 if prior.id is not null then if prior.actor<>me or prior.action<>p_action or prior.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado em outra operação.';end if;return prior.result;end if;
 if p_action='account_save' then
  v:=(p_data->>'venueId')::uuid;if not is_establishment_owner(v) then raise exception 'FATURA: Somente o dono autoriza crédito.';end if;
  select p.id into target from players p join auth.users u on u.id=p.auth_user_id where lower(u.email)=lower(trim(p_data->>'email')) and u.email_confirmed_at is not null and not p.is_guest;
  if target is null then raise exception 'FATURA: Informe e-mail de uma conta confirmada.';end if;
  perform pg_advisory_xact_lock(hashtext(v::text||target::text));
  select * into account from venue_credit_accounts where establishment_id=v and player_id=target for update;
  if account.id is not null and account.cut_day<>(p_data->>'cutDay')::int and credit_account_balance(account.id)>0 then raise exception 'FATURA: Quite o saldo antes de mudar o corte. Faturas existentes não mudam de data.';end if;
  if coalesce((p_data->>'limitCents')::int,0)<credit_account_balance(account.id) then raise exception 'FATURA: Limite menor que o saldo já lançado.';end if;
  insert into venue_credit_accounts(establishment_id,player_id,enabled,cut_day,limit_cents,created_by) values(v,target,true,(p_data->>'cutDay')::int,(p_data->>'limitCents')::int,me)
   on conflict(establishment_id,player_id) do update set enabled=true,cut_day=excluded.cut_day,limit_cents=excluded.limit_cents,updated_at=now() returning * into account;
 elsif p_action='account_disable' then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if not is_establishment_owner(v) then raise exception 'FATURA: Somente o dono suspende crédito.';end if;
  update venue_credit_accounts set enabled=false,updated_at=now() where id=account.id;
 elsif p_action='open_tab' then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if not venue_can(v,'pdv') or not account.enabled then raise exception 'FATURA: Cliente sem crédito ativo ou PDV não autorizado.';end if;
  insert into service_tabs(establishment_id,label,customer_player_id,customer_name,table_label,opened_by_player_id)
   select v,'C-'||upper(substr(nonce::text,1,8)),p.id,p.name,nullif(trim(p_data->>'table'),''),me from players p where p.id=account.player_id returning * into tab;
  insert into tab_participants(tab_id,player_id,name) values(tab.id,account.player_id,tab.customer_name);
  result:=jsonb_build_object('id',tab.id,'tab',to_jsonb(tab),'participant',(select to_jsonb(t) from tab_participants t where tab_id=tab.id limit 1));
 elsif p_action='rental_offer' then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if not (is_establishment_owner(v) or venue_can(v,'cash') and venue_can(v,'reservations')) or not account.enabled then raise exception 'FATURA: Sem permissão ou cliente sem crédito ativo.';end if;
  select * into booking from field_bookings where id=(p_data->>'bookingId')::uuid and establishment_id=v for update;
  cut:=(p_data->>'date')::date;amount:=(p_data->>'amountCents')::int;
  if booking.id is null or cut is null or cut<(now() at time zone 'America/Sao_Paulo')::date-30 or cut>(now() at time zone 'America/Sao_Paulo')::date+365 or
   (booking.recurrence='single' and cut<>booking.date) or (booking.recurrence='weekly' and extract(dow from cut)::int<>booking.day_of_week) then raise exception 'FATURA: Reserva ou ocorrência inválida.';end if;
  if exists(select 1 from games g where g.field_id=booking.field_id and g.pelada_id=booking.pelada_id and g.status<>'cancelled' and (g.scheduled_at at time zone 'America/Sao_Paulo')::date=cut) then raise exception 'FATURA: Reserva vinculada a jogo: use o rateio, sem duplicar a locação inteira.';end if;
  insert into venue_credit_rentals(account_id,booking_id,service_date,description,amount_cents,created_by)
   values(account.id,booking.id,cut,'Locação · '||booking.team_name||' · '||cut::text||' '||booking.time,amount,me) returning * into quote;
  insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,v,'Valor de locação para confirmar',quote.description||'. Escolha em Faturas se vai pagar na hora ou deixar no corte.');
 elsif p_action in('post_tab','post_rental') then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if account.id is null or not account.enabled or (account.player_id<>me and not venue_can(v,'cash')) then raise exception 'FATURA: Cliente não autorizado a deixar na fatura.';end if;
  if (p_data->>'consent')::boolean is distinct from true then raise exception 'FATURA: Confirme autorização para assumir este valor.';end if;
  if p_action='post_tab' then
   select * into tab from service_tabs where id=(p_data->>'tabId')::uuid and establishment_id=v for update;
   if tab.id is null or not credit_tab_read(tab.id) or tab.status not in('open','awaiting_payment','partially_paid') or exists(select 1 from venue_credit_lines where tab_id=tab.id) then raise exception 'FATURA: Comanda não disponível para faturar.';end if;
   if exists(select 1 from sale_payment_intents where tab_id=tab.id) then raise exception 'FATURA: Esta comanda já entrou no fluxo de pagamento. Não pode migrar para fatura; resolva o pagamento iniciado.';end if;
   select greatest(0,coalesce((select round(sum(i.quantity*i.unit_price)*100) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=tab.id and i.status<>'cancelled'),0)-coalesce((select round(sum(sp.amount)*100) from sale_payments sp where sp.tab_id=tab.id and sp.reversed_at is null),0)) into amount;
  else
   select * into quote from venue_credit_rentals where id=(p_data->>'rentalId')::uuid and account_id=account.id for update;
   if quote.id is null or quote.status<>'pending' then raise exception 'FATURA: Locação já tratada ou não pertence a esta conta.';end if;amount:=quote.amount_cents;
  end if;
  if amount<=0 or amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O saldo mudou. Atualize antes de confirmar.';end if;
  if exists(select 1 from venue_credit_invoices where account_id=account.id and cut_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(id)>0) then raise exception 'FATURA: Há fatura vencida. Pague na hora ou quite o atraso.';end if;
  if credit_account_balance(account.id)+amount>account.limit_cents then raise exception 'FATURA: Limite insuficiente. Pague na hora ou peça revisão ao dono.';end if;
  cut:=credit_cut_date(account.cut_day,(now() at time zone 'America/Sao_Paulo')::date);
  insert into venue_credit_invoices(account_id,cut_date) values(account.id,cut) on conflict(account_id,cut_date) do update set cut_date=excluded.cut_date returning * into invoice;
  insert into venue_credit_lines(invoice_id,kind,tab_id,rental_id,description,amount_cents,accepted_by,acceptance)
   values(invoice.id,case when p_action='post_tab' then 'food' else 'rental' end,case when p_action='post_tab' then tab.id end,case when p_action='post_rental' then quote.id end,
   case when p_action='post_tab' then 'Consumo · '||tab.label||' · '||tab.customer_name else quote.description end,amount,me,case when me=account.player_id then 'app' else 'counter' end) returning id into line_id;
  if p_action='post_tab' then update service_tabs set status='closed',closed_at=now() where id=tab.id;else update venue_credit_rentals set status='billed' where id=quote.id;end if;
  insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,v,'Lançamento na fatura','R$ '||(amount/100.0)::text||' incluído na sua fatura. Corte: '||cut::text||'. Consulte Faturas.');
  result:=jsonb_build_object('id',invoice.id,'cutDate',cut,'amountCents',amount);
 elsif p_action in('receive_invoice','receive_rental') then
  if p_action='receive_invoice' then select * into invoice from venue_credit_invoices where id=(p_data->>'invoiceId')::uuid;select * into account from venue_credit_accounts where id=invoice.account_id for update;balance:=credit_balance(invoice.id);
  else select * into quote from venue_credit_rentals where id=(p_data->>'rentalId')::uuid;select * into account from venue_credit_accounts where id=quote.account_id for update;
   select * into quote from venue_credit_rentals where id=quote.id for update;if quote.status<>'pending' then raise exception 'FATURA: Locação já tratada.';end if;balance:=quote.amount_cents;end if;
  v:=account.establishment_id;
  if not venue_can(v,'cash') then raise exception 'FATURA: Só o caixa autorizado registra recebimento.';end if;
  perform pg_advisory_xact_lock(hashtext('cash:'||v::text));
  if (p_data->>'confirmed')::boolean is distinct from true then raise exception 'FATURA: Confira o recebimento antes de registrar.';end if;
  amount:=(p_data->>'amountCents')::int;
  if amount is null or amount<=0 or amount>balance or (p_action='receive_rental' and amount<>balance) then raise exception 'FATURA: Valor inválido ou superior ao saldo.';end if;
  insert into venue_credit_payments(invoice_id,rental_id,amount_cents,method,reference,received_by,paid_at)
   values(case when p_action='receive_invoice' then invoice.id end,case when p_action='receive_rental' then quote.id end,amount,p_data->>'method',nullif(trim(p_data->>'reference'),''),me,clock_timestamp()) returning id into pay;
  if p_action='receive_invoice' then
   remaining:=amount;
   for rowline in select l.id,l.amount_cents-coalesce((select sum(a.amount_cents) from venue_credit_allocations a where a.line_id=l.id),0) pending from venue_credit_lines l where invoice_id=invoice.id order by posted_at,id loop
    part:=least(remaining,rowline.pending);if part>0 then insert into venue_credit_allocations values(pay,rowline.id,part);remaining:=remaining-part;end if;exit when remaining=0;
   end loop;if remaining<>0 then raise exception 'FATURA: Divergência de saldo: procure o dono.';end if;
  else update venue_credit_rentals set status='paid' where id=quote.id;end if;
  insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,v,'Recebimento registrado pelo caixa','R$ '||(amount/100.0)::text||' conferido presencialmente. Isso não é confirmação automática de gateway.');
  result:=jsonb_build_object('id',pay);
 elsif p_action='cancel_rental' then
  select * into quote from venue_credit_rentals where id=(p_data->>'rentalId')::uuid for update;select * into account from venue_credit_accounts where id=quote.account_id;v:=account.establishment_id;
  if (not is_establishment_owner(v) and account.player_id<>me) or quote.status<>'pending' then raise exception 'FATURA: Só o cliente ou dono cancela solicitação pendente.';end if;
  update venue_credit_rentals set status='cancelled' where id=quote.id;
 else raise exception 'FATURA: Ação inválida.';end if;
 if v is null then raise exception 'FATURA: Registro não encontrado.';end if;
 result:=coalesce(result,jsonb_build_object('id',coalesce(quote.id,account.id)));
 insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_'||p_action,(result->>'id')::uuid,jsonb_build_object('amountCents',amount));perform venue_ping(v);return result;
end$$;
revoke all on function credit_cut_date(integer,date),credit_balance(uuid),credit_account_balance(uuid),credit_tab_read(uuid),credit_source_guard(),credit_invoice_json(uuid),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_tab_read(uuid),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) to authenticated;
