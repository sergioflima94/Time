-- Historical baseline is a snapshot, never an invented transition or payment confirmation.
create table public.activity_history (
  sequence bigint generated always as identity primary key,
  source text not null,
  source_id uuid not null,
  kind text not null check(kind in ('game','booking','tab','campaign','class')),
  context_id uuid not null,
  pelada_id uuid,
  establishment_id uuid,
  field_id uuid,
  title text not null,
  subject_ids uuid[] not null default '{}',
  private boolean not null default false,
  operation text not null check(operation in ('baseline','INSERT','UPDATE','DELETE')),
  actor_id uuid,
  before_value jsonb,
  after_value jsonb,
  recorded_at timestamptz not null default clock_timestamp()
);
create index activity_history_context on public.activity_history(kind,context_id,sequence desc);
create index activity_history_venue on public.activity_history(establishment_id,sequence desc);
create index activity_history_team on public.activity_history(pelada_id,sequence desc);
create index activity_history_subjects on public.activity_history using gin(subject_ids);
alter table public.activity_history enable row level security;
revoke all on public.activity_history from anon,authenticated;

-- Only allowlisted operational data. No tokens, Pix codes, URLs, phone, medical data,
-- private messages, rating ballots or GPS search origins are copied into this journal.
create function public.activity_history_fields(p_source text) returns text[]
language sql immutable set search_path=public,pg_temp as $$
 select case p_source
 when 'games' then array['scheduled_at','status','field_cost','max_players','players_per_team','match_minutes','duration_minutes','draw_method','rotation_mode','field_id']
 when 'attendances' then array['status','checked_in','no_show','responded_at']
 when 'match_turns' then array['started_at','ended_at','duration_seconds','winner_team_id']
 when 'goals' then array['team_id','scorer_player_id','scored_at']
 when 'player_fatigue' then array['status','matches_remaining']
 when 'payments' then array['method','status','paid_at']
 when 'field_bookings' then array['recurrence','day_of_week','date','time','duration_minutes','field_id','team_name']
 when 'game_booking_requests' then array['status','requested_start_at','duration_minutes','attempt','responded_at','field_id']
 when 'opportunity_requests' then array['status','price','booking_id']
 when 'booking_deposits' then array['status','amount_cents','provider','method','paid_at','refunded_at']
 when 'service_tabs' then array['label','table_label','status','opened_at','closed_at']
 when 'service_orders' then array['status','submitted_at','completed_at']
 when 'service_order_items' then array['product_id','quantity','unit_price','status','cancellation_reason']
 when 'order_item_shares' then array['participant_id','amount_cents']
 when 'sale_payments' then array['amount','method','paid_at','reversed_at']
 when 'sale_payment_intents' then array['status','amount_cents','provider','method','paid_at','expires_at']
 when 'team_availability_polls' then array['question','status','closes_at','selected_option_id','quorum_required']
 when 'fundraising_campaigns' then array['title','status','target_amount','deadline','closed_at']
 when 'fundraising_contributions' then array['amount','method','provider','status','paid_at']
 when 'fundraising_expenses' then array['title','amount','created_at']
 when 'class_sessions' then array['starts_at','ends_at','status','cancellation_reason']
 when 'class_enrollments' then array['status','payment_status','payment_method','amount','is_trial','enrolled_at','paid_at']
 else '{}'::text[] end
$$;

create function public.activity_history_context(p_source text,p_row jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare root jsonb; parent jsonb; kind text; context uuid; team uuid; venue uuid; field uuid;
 title text; subjects uuid[]:='{}'; restricted boolean:=false; x text;
begin
 if p_source in ('games','attendances','match_turns','goals','player_fatigue','payments','team_availability_polls') then
   kind:='game';
   if p_source='games' then root:=p_row; else select to_jsonb(g) into root from games g where g.id=(p_row->>'game_id')::uuid; end if;
   context:=(root->>'id')::uuid; team:=(root->>'pelada_id')::uuid; field:=(root->>'field_id')::uuid;
   select name into title from peladas where id=team; title:=coalesce(title,'Jogo');
   restricted:=p_source='payments';
 elsif p_source in ('field_bookings','game_booking_requests','opportunity_requests','booking_deposits') then
   kind:='booking'; root:=p_row;
   if p_source='booking_deposits' then select to_jsonb(b) into root from game_booking_requests b where b.id=(p_row->>'booking_request_id')::uuid; end if;
   context:=(root->>'id')::uuid; team:=(root->>'pelada_id')::uuid; field:=(root->>'field_id')::uuid;
   if p_source in ('game_booking_requests','booking_deposits') then select pelada_id into team from games where id=(root->>'game_id')::uuid; end if;
   if p_source='opportunity_requests' then select field_id into field from opportunity_slots where id=(root->>'slot_id')::uuid; end if;
   restricted:=true; title:=coalesce(root->>'team_name','Reserva de campo');
   if p_source='field_bookings' and root->>'created_by' is not null then subjects:=array[(root->>'created_by')::uuid]; end if;
 elsif p_source in ('service_tabs','service_orders','service_order_items','order_item_shares','sale_payments','sale_payment_intents') then
   kind:='tab';
   if p_source='service_tabs' then root:=p_row;
   elsif p_source='service_order_items' then
     select to_jsonb(t) into root from service_orders o join service_tabs t on t.id=o.tab_id where o.id=(p_row->>'order_id')::uuid;
   elsif p_source='order_item_shares' then
     select to_jsonb(t) into root from service_order_items i join service_orders o on o.id=i.order_id join service_tabs t on t.id=o.tab_id where i.id=(p_row->>'item_id')::uuid;
   else select to_jsonb(t) into root from service_tabs t where t.id=(p_row->>'tab_id')::uuid; end if;
   context:=(root->>'id')::uuid; venue:=(root->>'establishment_id')::uuid; title:=coalesce(root->>'label','Comanda'); restricted:=true;
   if root->>'customer_player_id' is not null then subjects:=array[(root->>'customer_player_id')::uuid]; end if;
 elsif p_source in ('fundraising_campaigns','fundraising_contributions','fundraising_expenses') then
   kind:='campaign';
   if p_source='fundraising_campaigns' then root:=p_row; else select to_jsonb(c) into root from fundraising_campaigns c where c.id=(p_row->>'campaign_id')::uuid; end if;
   context:=(root->>'id')::uuid; team:=(root->>'pelada_id')::uuid; title:=coalesce(root->>'title','Vaquinha'); restricted:=p_source='fundraising_contributions';
 elsif p_source in ('class_sessions','class_enrollments') then
   kind:='class';
   if p_source='class_sessions' then root:=p_row; else select to_jsonb(s) into root from class_sessions s where s.id=(p_row->>'session_id')::uuid; end if;
   context:=(root->>'id')::uuid;
   select to_jsonb(p) into parent from class_programs p where p.id=(root->>'program_id')::uuid;
   venue:=(parent->>'establishment_id')::uuid; field:=(parent->>'field_id')::uuid; title:=coalesce(parent->>'title',parent->>'name','Aula'); restricted:=true;
 end if;
 if field is not null and venue is null then select establishment_id into venue from fields where id=field; end if;
 foreach x in array array['player_id','paid_by_player_id','credited_player_id','payer_player_id'] loop
   if p_row->>x is not null then subjects:=array_append(subjects,(p_row->>x)::uuid); end if;
 end loop;
 if context is null then return null; end if;
 return jsonb_build_object('kind',kind,'context',context,'team',team,'venue',venue,'field',field,'title',title,'subjects',subjects,'private',restricted);
end $$;

create function public.activity_history_record(p_source text,p_row jsonb,p_previous jsonb,p_operation text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; a jsonb; b jsonb; actor uuid;
begin
 select coalesce(jsonb_object_agg(key,value),'{}') into a from jsonb_each(p_row) where key=any(activity_history_fields(p_source));
 select coalesce(jsonb_object_agg(key,value),'{}') into b from jsonb_each(coalesce(p_previous,'{}')) where key=any(activity_history_fields(p_source));
 if p_operation='UPDATE' and a=b then return; end if;
 c:=activity_history_context(p_source,p_row); if c is null then return; end if;
 if p_operation<>'baseline' then select id into actor from players where auth_user_id=auth.uid(); end if;
 insert into activity_history(source,source_id,kind,context_id,pelada_id,establishment_id,field_id,title,subject_ids,private,operation,actor_id,before_value,after_value)
 values(p_source,(p_row->>'id')::uuid,c->>'kind',(c->>'context')::uuid,(c->>'team')::uuid,(c->>'venue')::uuid,(c->>'field')::uuid,c->>'title',
   array(select jsonb_array_elements_text(c->'subjects')::uuid),(c->>'private')::boolean,p_operation,actor,
   case when p_operation in ('UPDATE','DELETE') then case when p_operation='DELETE' then a else b end end,
   case when p_operation<>'DELETE' then a end);
end $$;

create function public.activity_history_capture() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform activity_history_record(tg_table_name,case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end,
   case when tg_op='UPDATE' then to_jsonb(old) end,tg_op);
 return null;
end $$;

-- Clients cannot append, alter or erase authoritative history; the source transaction owns it.
do $$ declare t text; r record; begin
 foreach t in array array['games','attendances','match_turns','goals','player_fatigue','payments','field_bookings','game_booking_requests','opportunity_requests','booking_deposits',
 'service_tabs','service_orders','service_order_items','order_item_shares','sale_payments','sale_payment_intents','team_availability_polls','fundraising_campaigns','fundraising_contributions','fundraising_expenses','class_sessions','class_enrollments'] loop
   execute format('create trigger activity_history_capture after insert or update or delete on public.%I for each row execute function public.activity_history_capture()',t);
   for r in execute format('select to_jsonb(x) as row from public.%I x',t) loop perform activity_history_record(t,r.row,null,'baseline'); end loop;
 end loop;
end $$;

create function public.activity_history_finance(p_venue uuid) returns boolean
language sql security definer stable set search_path=public,pg_temp as $$
 select is_establishment_owner(p_venue) or exists(select 1 from establishment_staff s join players p on p.id=s.player_id
 where s.establishment_id=p_venue and s.active and p.auth_user_id=auth.uid() and s.roles && array['manager','cashier']::text[])
$$;

create function public.activity_history_access(e public.activity_history) returns boolean
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();
begin
 if me is null then return false; end if;
 if me=any(e.subject_ids) then return true; end if;
 if e.establishment_id is not null and activity_history_finance(e.establishment_id) then return true; end if;
 if e.pelada_id is not null and (case when e.private then is_admin_of_pelada(e.pelada_id) else is_member_of_pelada(e.pelada_id) end) then return true; end if;
 if e.kind='tab' then return exists(select 1 from tab_participants where tab_id=e.context_id and player_id=me); end if;
 if e.kind='class' and e.source='class_sessions' then return exists(select 1 from class_enrollments where session_id=e.context_id and player_id=me and status<>'cancelled'); end if;
 return false;
end $$;

create function public.activity_history_read(p_scope text default 'mine',p_venue uuid default null,p_kind text default null,p_context uuid default null,p_before bigint default null,p_from timestamptz default null,p_to timestamptz default null,p_team uuid default null,p_field uuid default null)
returns jsonb language plpgsql security definer stable set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me(); data jsonb;
begin
 if me is null then raise exception 'HISTORY: Entre no aplicativo.'; end if;
 if p_scope not in ('mine','venue','context') or (p_kind is not null and p_kind not in ('game','booking','tab','campaign','class')) then raise exception 'HISTORY: Filtro inválido.'; end if;
 if p_scope='venue' and (p_venue is null or not activity_history_finance(p_venue)) then raise exception 'HISTORY: Sem permissão para este estabelecimento.'; end if;
 if p_scope='context' and (p_context is null or p_kind is null) then raise exception 'HISTORY: Informe o registro.'; end if;
 select coalesce(jsonb_agg(x.obj order by x.sequence desc),'[]') into data from (
   select e.sequence,jsonb_build_object('id',e.sequence::text,'source',e.source,'sourceId',e.source_id,'kind',e.kind,'contextId',e.context_id,
   'teamId',e.pelada_id,'venueId',e.establishment_id,'fieldId',e.field_id,'title',e.title,'operation',e.operation,
   'actorName',case when e.actor_id=me then 'Você' when e.actor_id is null then 'Sistema / responsável não registrado' else coalesce(p.nickname,p.name,'Conta indisponível') end,
   'before',e.before_value,'after',e.after_value,'recordedAt',e.recorded_at) as obj
   from activity_history e left join players p on p.id=e.actor_id
   where activity_history_access(e) and (p_before is null or e.sequence<p_before) and (p_kind is null or e.kind=p_kind)
   and (p_from is null or e.recorded_at>=p_from) and (p_to is null or e.recorded_at<p_to)
   and (p_team is null or e.pelada_id=p_team) and (p_field is null or e.field_id=p_field)
   and case p_scope when 'venue' then e.establishment_id=p_venue when 'context' then e.context_id=p_context
     else (me=any(e.subject_ids) or e.actor_id=me or (not e.private and e.pelada_id is not null and is_member_of_pelada(e.pelada_id))
       or (e.kind='booking' and e.pelada_id is not null and is_admin_of_pelada(e.pelada_id))
       or (e.kind='tab' and exists(select 1 from tab_participants where tab_id=e.context_id and player_id=me))
       or (e.kind='class' and e.source='class_sessions' and exists(select 1 from class_enrollments where session_id=e.context_id and player_id=me and status<>'cancelled'))) end
   order by e.sequence desc limit 51
 ) x;
 return jsonb_build_object('entries',case when jsonb_array_length(data)>50 then data-'50'::int else data end,'hasMore',jsonb_array_length(data)>50);
end $$;

revoke all on function public.activity_history_fields(text),public.activity_history_context(text,jsonb),public.activity_history_record(text,jsonb,jsonb,text),public.activity_history_capture(),public.activity_history_finance(uuid),public.activity_history_access(public.activity_history),public.activity_history_read(text,uuid,text,uuid,bigint,timestamptz,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.activity_history_read(text,uuid,text,uuid,bigint,timestamptz,timestamptz,uuid,uuid) to authenticated;
