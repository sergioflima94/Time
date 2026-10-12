create function public.credit_booking_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if exists(select 1 from venue_credit_rentals where booking_id=old.id and status<>'cancelled') and
 (tg_op='DELETE' or (to_jsonb(new)-'notes') is distinct from (to_jsonb(old)-'notes')) then raise exception 'FATURA: Reserva tem valor combinado/faturado; trate a solicitação e o financeiro antes de alterar.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
create trigger credit_booking_guard before update or delete on field_bookings for each row execute function credit_booking_guard();
revoke all on function credit_booking_guard() from public,anon,authenticated;
-- Existing financial views include actual collections, not invoice issuance.
do $$declare body text;previous text;begin
 previous:=pg_get_functiondef('public.venue_snapshot(uuid)'::regprocedure);
 body:=replace(previous,'if venue_can(v,''reports'') or venue_can(v,''cash'') then',
 'if venue_can(v,''reports'') or venue_can(v,''cash'') then
  result:=result||jsonb_build_object(''invoice_pending_cents'',coalesce((select sum(credit_account_balance(id)) from venue_credit_accounts where establishment_id=v),0),
   ''credit_received_cents'',coalesce((select sum(p.amount_cents) from venue_credit_payments p left join venue_credit_invoices i on i.id=p.invoice_id left join venue_credit_rentals q on q.id=p.rental_id join venue_credit_accounts a on a.id=coalesce(i.account_id,q.account_id) where a.establishment_id=v and (p.paid_at at time zone ''America/Sao_Paulo'')::date=(now() at time zone ''America/Sao_Paulo'')::date),0));');
 if body=previous then raise exception 'credit venue snapshot hook missing';end if;execute body;
 previous:=pg_get_functiondef('public.venue_action(text,jsonb)'::regprocedure);
 body:=replace(previous,'into expected;',
 '+coalesce((select sum(p.amount_cents)/100.0 from venue_credit_payments p left join venue_credit_invoices i on i.id=p.invoice_id left join venue_credit_rentals q on q.id=p.rental_id join venue_credit_accounts a on a.id=coalesce(i.account_id,q.account_id) where a.establishment_id=v and p.method=''cash'' and p.paid_at>=shift.opened_at),0) into expected;');
 if body=previous then raise exception 'credit cash shift hook missing';end if;execute body;
end$$;
