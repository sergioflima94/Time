-- Harden RPC request size without changing prices or existing invoices.
do $$declare body text;previous text;signature text;begin
 foreach signature in array array['public.academy_action(text,jsonb)','public.venue_action(text,jsonb)'] loop
  previous:=pg_get_functiondef(signature::regprocedure);
  body:=replace(previous,'if me is null then raise exception ''OPERAÇÃO: Entre na sua conta.'';end if;',
   'if me is null then raise exception ''OPERAÇÃO: Entre na sua conta.'';end if;
    if p_data is null or jsonb_typeof(p_data)<>''object'' or pg_column_size(p_data)>16384 then raise exception ''OPERAÇÃO: Dados inválidos ou muito grandes.'';end if;');
  if body=previous then raise exception 'venue size guard hook missing';end if;execute body;
 end loop;
 previous:=pg_get_functiondef('public.venue_snapshot(uuid)'::regprocedure);
 body:=replace(previous,'''id'',id,''name'',name','''id'',id,''name'',name,''sport_ids'',sport_ids');
 if body=previous then raise exception 'venue field sports hook missing';end if;execute body;
end$$;
