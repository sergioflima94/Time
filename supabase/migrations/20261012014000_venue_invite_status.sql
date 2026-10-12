-- PDV can monitor authorized invitations without exporting phone/email.
do $$declare body text;previous text;begin
 previous:=pg_get_functiondef('public.venue_snapshot(uuid)'::regprocedure);
 body:=replace(previous,'if venue_can(v,''pdv'') then',
 'if venue_can(v,''pdv'') then
  result:=result||jsonb_build_object(''invites'',coalesce((select jsonb_agg(x) from
   (select i.id,p.name,i.created_at,case when i.status=''queued'' and i.created_at<now()-interval ''24 hours'' then ''expired'' else i.status end status
   from venue_invites i join venue_prospects p on p.id=i.prospect_id where p.establishment_id=v order by i.created_at desc limit 20)x),''[]''::jsonb));');
 if body=previous then raise exception 'venue invite status hook missing';end if;execute body;
 previous:=pg_get_functiondef('public.venue_invite_service(uuid,uuid,text,text)'::regprocedure);
 body:=replace(previous,'if p_action=''peek'' then return jsonb_build_object(''channel'',p.channel,''status'',i.status);end if;',
 'if p_action=''peek'' then return jsonb_build_object(''channel'',p.channel,''status'',case when i.status=''queued'' and i.created_at<now()-interval ''24 hours'' then ''expired'' else i.status end);end if;');
 if body=previous then raise exception 'venue invite expiry hook missing';end if;execute body;
end$$;
