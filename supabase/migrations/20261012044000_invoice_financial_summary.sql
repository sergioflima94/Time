create function credit_financial_summary(ids uuid[]) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('gross_cents',coalesce(sum(t.amount_cents),0),'refunded_cents',coalesce(sum(t.amount_cents-credit_payment_net(t.payment_id)),0),'fee_cents',coalesce(sum(f.fee_cents),0),'net_reported_cents',coalesce(sum(f.net_cents),0),'unknown_fee_count',count(*)filter(where f.fee_cents is null),'unknown_net_count',count(*)filter(where f.net_cents is null)) from venue_credit_intents t left join venue_credit_provider_financials f on f.intent_id=t.id where t.invoice_id=any(ids) and t.payment_id is not null$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_search(uuid,jsonb)'::regprocedure);
 b:=replace(b,'return result||jsonb_build_object(''invoices'',page','result:=result||jsonb_build_object(''financial_summary'',credit_financial_summary(array(select credit_filtered_ids(p_venue,p_query))));return result||jsonb_build_object(''invoices'',page');execute b;
end$$;
revoke all on function credit_financial_summary(uuid[]) from public,anon,authenticated;
