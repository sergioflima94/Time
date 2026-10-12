alter table venue_whatsapp_instances add column bound_owner_id uuid references players(id);
update venue_whatsapp_instances w set bound_owner_id=e.owner_player_id from establishments e where e.id=w.establishment_id;
do $$declare b text;begin
 b:=pg_get_functiondef('whatsapp_instance_service(text,jsonb)'::regprocedure);
 b:=replace(b,'from venue_whatsapp_instances where establishment_id=v;return','from venue_whatsapp_instances where establishment_id=v and bound_owner_id=(select owner_player_id from establishments where id=v);return');
 b:=replace(b,'insert into venue_whatsapp_instances(establishment_id) values(v) on conflict do nothing;',
 'insert into venue_whatsapp_instances(establishment_id,bound_owner_id) values(v,me) on conflict(establishment_id) do update set bound_owner_id=me,instance_name=''mj-''||replace(gen_random_uuid()::text,''-'',''''),state=''unknown'',updated_at=now() where venue_whatsapp_instances.bound_owner_id is distinct from me;');execute b;
end$$;
-- No raw code retained. Old challenges are kept briefly for rate-limit/abuse accounting.
do $$begin if to_regnamespace('cron') is not null then perform cron.schedule('customer-phone-challenge-cleanup','15 12 * * *','delete from public.customer_phone_challenges where created_at<now()-interval ''7 days'';');end if;end$$;
create or replace function credit_invoice_held(i uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from venue_credit_intents where invoice_id=i and state in('building','pending','uncertain','review')) or exists(select 1 from venue_credit_refund_requests r join venue_credit_intents t on t.id=r.intent_id where t.invoice_id=i and r.status='claimed')$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_payment_service_core(text,jsonb)'::regprocedure);
 b:=replace(b,'nonce:=(p_data->>''requestId'')::uuid;if nonce is null',
 'if exists(select 1 from venue_credit_refund_requests r join venue_credit_intents x on x.id=r.intent_id where x.invoice_id=i.id and r.status=''claimed'') then raise exception ''FATURA: Consulte a devolução pendente antes de outro Pix.'';end if;
 nonce:=(p_data->>''requestId'')::uuid;if nonce is null');
 b:=replace(b,'if t.id is null then',
 'if t.id is not null and p_data->>''amountCents'' is not null and (p_data->>''amountCents'')::int<>t.amount_cents then raise exception ''FATURA: Há outro Pix pendente com valor diferente. Consulte antes de gerar.'';end if;
 if t.id is null then');execute b;
end$$;
alter function credit_checkout_history(uuid,timestamptz,uuid) rename to credit_checkout_history_v1;
revoke all on function credit_checkout_history_v1(uuid,timestamptz,uuid) from public,anon,authenticated;
create function credit_checkout_history(p_invoice uuid,p_before timestamptz default null,p_intent uuid default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare a venue_credit_accounts;me uuid:=community_chat_me();begin
 select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=p_invoice);
 if me is null or a.id is null or not(a.player_id=me or venue_can(a.establishment_id,'cash') or venue_can(a.establishment_id,'reports')) then raise exception 'FATURA: Sem acesso ao histórico.';end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'FATURA: Cursor incompleto.';end if;
 return coalesce((select jsonb_agg(credit_intent_json(t) order by created_at desc,id desc) from(select * from venue_credit_intents where invoice_id=p_invoice and (p_intent is null or id=p_intent) and(p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 20)t),'[]'::jsonb);
end$$;
revoke all on function credit_checkout_history(uuid,timestamptz,uuid,uuid) from public,anon,authenticated;grant execute on function credit_checkout_history(uuid,timestamptz,uuid,uuid) to authenticated;
