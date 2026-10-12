-- Remote plpgsql_check caught alias o colliding with the venue_occupancy variable.
-- Keep authorization and transition rules unchanged; no customer data is mutated.
do $$declare previous text;body text;begin
 previous:=pg_get_functiondef('public.venue_action(text,jsonb)'::regprocedure);
 body:=replace(previous,
 'from service_orders o,service_tabs t where i.id=k and i.order_id=o.id and o.tab_id=t.id',
 'from service_orders kitchen_order,service_tabs t where i.id=k and i.order_id=kitchen_order.id and kitchen_order.tab_id=t.id');
 if body=previous then raise exception 'kitchen transition alias hook missing';end if;
 body:=replace(body,'update service_orders o set status=case','update service_orders kitchen_order set status=case');
 body:=replace(body,'where i.order_id=o.id','where i.order_id=kitchen_order.id');
 body:=replace(body,'where o.id=(select order_id from service_order_items where id=k);','where kitchen_order.id=(select order_id from service_order_items where id=k);');
 execute body;
end$$;
