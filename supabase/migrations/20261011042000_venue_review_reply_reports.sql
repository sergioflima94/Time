-- Reenvio da mesma denúncia é idempotente. Uma resposta editada após análise
-- pode ser denunciada novamente, preservando as evidências da versão anterior
-- em moderation_reports (sem apagar/reciclar o registro original).
do $$ declare definition text; needle text; begin
  select pg_get_functiondef('public.venue_review_action(text,jsonb)'::regprocedure) into definition;
  needle:='if rid is not null then return jsonb_build_object(''id'',rid); end if;';
  if position(needle in definition)=0 then raise exception 'Review report version hook missing'; end if;
  definition:=replace(definition,needle,
    'if rid is not null and (subject_kind=''review'' or exists(select 1 from venue_review_reports rp where rp.id=rid and rp.created_at>=r.replied_at)) then return jsonb_build_object(''id'',rid); end if;');
  needle:='values(r.id,me,subject_kind,reason,body,v) returning id into rid;';
  if position(needle in definition)=0 then raise exception 'Review report upsert hook missing'; end if;
  definition:=replace(definition,needle,
    'values(r.id,me,subject_kind,reason,body,v) on conflict(review_id,player_id,subject) do update set reason=excluded.reason,details=excluded.details,moderation_report_id=excluded.moderation_report_id,created_at=clock_timestamp() returning id into rid;');
  execute definition;
  select pg_get_functiondef('public.venue_review_snapshot(uuid,uuid,uuid,boolean)'::regprocedure) into definition;
  needle:='where review_id=r.id and player_id=me and subject=''reply''';
  if position(needle in definition)=0 then raise exception 'Review reply reported hook missing'; end if;
  definition:=replace(definition,needle,needle||' and created_at>=r.replied_at');
  execute definition;
end $$;
