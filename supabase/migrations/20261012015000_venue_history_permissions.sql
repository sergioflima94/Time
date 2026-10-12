-- Role labels must not bypass the owner's explicit financial grants.
create or replace function public.activity_history_finance(p_venue uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select venue_can(p_venue,'reports') or venue_can(p_venue,'cash')
$$;
