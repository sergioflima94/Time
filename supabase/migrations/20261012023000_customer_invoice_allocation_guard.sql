-- A payment on another tab must not mutate shares belonging to a billed tab.
do $$declare previous text;body text;begin
 previous:=pg_get_functiondef('public.credit_source_guard()'::regprocedure);
 body:=replace(previous,'perform 1 from service_tabs where id=tab for update;',
 'perform 1 from service_tabs where id=tab for update;
 if tg_table_name=''sale_payment_allocations'' and tg_op<>''DELETE'' and not exists(
  select 1 from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id
  where s.id=(afterdata->>''item_share_id'')::uuid and o.tab_id=tab
 ) then raise exception ''FATURA: Pagamento e parte consumida devem pertencer à mesma comanda.'';end if;');
 if body=previous then raise exception 'credit allocation hook missing';end if;execute body;
end$$;
