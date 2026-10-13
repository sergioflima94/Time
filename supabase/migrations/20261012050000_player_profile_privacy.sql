-- Direct records are private. Cards/rosters use an explicit public projection.
drop policy if exists players_select_all on public.players;
create policy players_select_self on public.players for select to authenticated
using (auth_user_id=auth.uid());

create function public.player_profiles_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Entre com uma conta ativa' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'auth_user_id',case when p.auth_user_id=auth.uid() then p.auth_user_id end,
    'name',p.name,'nickname',p.nickname,'avatar_url',p.avatar_url,'card_background_url',p.card_background_url,
    'premium_since',p.premium_since,'premium_until',p.premium_until,'premium_auto_renew',case when p.auth_user_id=auth.uid() then p.premium_auto_renew else false end,
    'is_guest',p.is_guest,'phone',case when p.auth_user_id=auth.uid() then p.phone end,
    'whatsapp_opt_in',case when p.auth_user_id=auth.uid() then p.whatsapp_opt_in else false end,
    'banter_opt_in',p.banter_opt_in,'preferred_position',p.preferred_position,'favorite_sports',p.favorite_sports,
    'free_agent_opt_in',p.free_agent_opt_in,'free_agent_radius_km',case when p.auth_user_id=auth.uid() or p.free_agent_opt_in then p.free_agent_radius_km end,
    'free_agent_availability',case when p.auth_user_id=auth.uid() or p.free_agent_opt_in then p.free_agent_availability else '[]'::jsonb end,
    'location_lat',case when p.auth_user_id=auth.uid() then p.location_lat when p.free_agent_opt_in then round(p.location_lat::numeric,2)::double precision end,
    'location_lng',case when p.auth_user_id=auth.uid() then p.location_lng when p.free_agent_opt_in then round(p.location_lng::numeric,2)::double precision end,
    'location_updated_at',case when p.auth_user_id=auth.uid() or p.free_agent_opt_in then p.location_updated_at end,
    'created_at',p.created_at
  ) order by p.id) from players p where not exists(select 1 from platform_account_controls c where c.player_id=p.id and c.suspended)), '[]'::jsonb);
end $$;
revoke all on function public.player_profiles_snapshot() from public,anon;
grant execute on function public.player_profiles_snapshot() to authenticated;
