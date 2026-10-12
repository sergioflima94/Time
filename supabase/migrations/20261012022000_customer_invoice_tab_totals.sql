-- Clients may see fewer legacy payment rows under RLS. Display authoritative
-- totals for the whole tab they are explicitly about to assume, not a cache sum.
do $$declare body text;previous text;begin
 previous:=pg_get_functiondef('public.credit_snapshot(uuid,uuid,text)'::regprocedure);
 body:=replace(previous,'''tab_id'',p_tab,',
 '''tab_id'',p_tab,
   ''gross_cents'',(select coalesce(round(sum(i.quantity*i.unit_price)*100),0) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=p_tab and i.status<>''cancelled'' and o.status<>''cancelled''),
   ''paid_cents'',(select coalesce(round(sum(amount)*100),0) from sale_payments where tab_id=p_tab and reversed_at is null),
   ''payment_started'',exists(select 1 from sale_payment_intents where tab_id=p_tab),
   ''can_bill'',tab.status in(''open'',''awaiting_payment'',''partially_paid''),');
 if body=previous then raise exception 'credit tab totals hook missing';end if;
 body:=replace(body,'where o.tab_id=p_tab and i.status<>''cancelled'')','where o.tab_id=p_tab and i.status<>''cancelled'' and o.status<>''cancelled'')');
 execute body;
 previous:=pg_get_functiondef('public.credit_action(text,jsonb)'::regprocedure);
 body:=replace(previous,'where o.tab_id=tab.id and i.status<>''cancelled'')','where o.tab_id=tab.id and i.status<>''cancelled'' and o.status<>''cancelled'')');
 if body=previous then raise exception 'credit cancelled order hook missing';end if;execute body;
end$$;
