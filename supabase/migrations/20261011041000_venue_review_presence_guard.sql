-- O selo usa check-in; RSVP pessoal não pode forjar presença/falta pela API direta.
create function public.guard_attendance_presence() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare team uuid;
begin
  if tg_op='UPDATE' and (new.game_id is distinct from old.game_id or new.player_id is distinct from old.player_id) then
    raise exception 'Presença não pode ser transferida para outra pessoa ou jogo';
  end if;
  if auth.uid() is null or auth.role()='service_role' then return new; end if;
  if (tg_op='INSERT' and (new.checked_in or new.no_show)) or (tg_op='UPDATE' and
    (new.checked_in is distinct from old.checked_in or new.no_show is distinct from old.no_show)) then
    select pelada_id into team from games where id=new.game_id;
    if not public.platform_account_allowed() or not public.is_admin_of_pelada(team) then
      raise exception 'Somente a administração do time registra presença ou falta';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_attendance_presence() from public,anon,authenticated;
create trigger guard_attendance_presence before insert or update on public.attendances
  for each row execute function public.guard_attendance_presence();
