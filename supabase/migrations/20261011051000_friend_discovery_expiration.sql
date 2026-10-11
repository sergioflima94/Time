-- Clear expired coordinates on the next discovery request (no background tracking).
alter function public.friend_discovery(text,jsonb) rename to friend_discovery_core;
revoke all on function public.friend_discovery_core(text,jsonb) from public,anon,authenticated;
create function public.friend_discovery(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();
begin
  if me is null then raise exception 'AMIGOS:Entre na sua conta'; end if;
  update friend_discovery_preferences set latitude=null,longitude=null,located_at=null,nearby=false
    where located_at<clock_timestamp()-interval '2 hours';
  delete from friend_join_invites where inviter_id=me and expires_at<clock_timestamp();
  return public.friend_discovery_core(p_action,p_data);
end $$;
revoke all on function public.friend_discovery(text,jsonb) from public,anon;
grant execute on function public.friend_discovery(text,jsonb) to authenticated;
