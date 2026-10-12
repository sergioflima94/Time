-- Keep the pending-amount check only in prepare, not in provider proof validation.
do $$declare b text;previous text;begin
 previous:=pg_get_functiondef('credit_payment_service_core(text,jsonb)'::regprocedure);
 b:=replace(previous,'if t.id is not null and p_data->>''amountCents'' is not null and (p_data->>''amountCents'')::int<>t.amount_cents then raise exception ''FATURA: Há outro Pix pendente com valor diferente. Consulte antes de gerar.'';end if;
 if t.id is null then raise exception ''FATURA: Cobrança não encontrada.'';end if;',
 'if t.id is null then raise exception ''FATURA: Cobrança não encontrada.'';end if;');
 if b=previous then raise exception 'invoice context amount guard hook missing';end if;execute b;
end$$;
