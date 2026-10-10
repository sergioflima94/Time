-- No Supabase, pgcrypto fica em extensions. O search_path anterior só incluía
-- public e impedia digest() no check-in. Não altera tokens ou presenças.
alter function public.issue_game_checkin_pass(uuid,uuid,text) set search_path = public, extensions, pg_temp;
alter function public.redeem_game_checkin(uuid,uuid,text,uuid) set search_path = public, extensions, pg_temp;
