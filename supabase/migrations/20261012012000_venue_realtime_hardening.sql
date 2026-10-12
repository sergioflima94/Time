-- Ping contains no customer names, amounts or lesson roster.
create function public.venue_changed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare rowdata jsonb;v uuid;begin
 rowdata:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name in('service_tabs','field_bookings','cash_shifts','class_programs') then v:=(rowdata->>'establishment_id')::uuid;
 elsif tg_table_name in('service_orders','sale_payments') then select establishment_id into v from service_tabs where id=(rowdata->>'tab_id')::uuid;
 elsif tg_table_name='service_order_items' then select t.establishment_id into v from service_orders o join service_tabs t on t.id=o.tab_id where o.id=(rowdata->>'order_id')::uuid;
 elsif tg_table_name='class_sessions' then select establishment_id into v from class_programs where id=(rowdata->>'program_id')::uuid;
 end if;if v is not null then perform venue_ping(v);end if;return null;
end$$;
revoke all on function venue_changed() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['service_tabs','service_orders','service_order_items','sale_payments','field_bookings','class_sessions','class_programs','cash_shifts'] loop
 execute format('create trigger venue_changed after insert or update or delete on %I for each row execute function venue_changed()',t);end loop;end$$;
-- Old enrolment cache does not expose prices to PDV or kitchen-only employees.
drop policy if exists class_enrollments_select_self_or_staff on class_enrollments;
create policy class_enrollments_select_self_or_staff on class_enrollments for select to authenticated using((player_id in(select id from players where auth_user_id=auth.uid()) and platform_account_allowed()) or exists(select 1 from class_sessions s join class_programs p on p.id=s.program_id where s.id=session_id and (venue_can(p.establishment_id,'cash') or venue_can(p.establishment_id,'reports'))));
create policy venue_notices_self on venue_notices for select to authenticated using(player_id in(select id from players where auth_user_id=auth.uid()) and platform_account_allowed());
grant select on venue_notices to authenticated;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table venue_notices;end if;end$$;
