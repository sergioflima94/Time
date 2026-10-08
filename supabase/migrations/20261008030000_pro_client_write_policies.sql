-- Escritas seguras dos módulos Pro que antes existiam apenas na demonstração local.

drop policy if exists "subscriptions_start_trial" on public.commercial_subscriptions;
create policy "subscriptions_start_trial"
  on public.commercial_subscriptions for insert
  with check (
    status = 'trial'
    and (
      (subscriber_player_id is not null and exists (
        select 1 from public.players p
        where p.id = subscriber_player_id and p.auth_user_id = auth.uid()
      ))
      or (pelada_id is not null and public.is_admin_of_pelada(pelada_id))
      or (establishment_id is not null and public.can_operate_establishment(establishment_id))
    )
  );

drop policy if exists "referrals_owner_update" on public.referral_campaigns;
create policy "referrals_owner_update"
  on public.referral_campaigns for update
  using (
    exists (
      select 1 from public.players p
      where p.id = owner_player_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = owner_player_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "referral_redemptions_insert_self" on public.referral_redemptions;
create policy "referral_redemptions_insert_self"
  on public.referral_redemptions for insert
  with check (
    status = 'pending'
    and exists (
      select 1 from public.players p
      where p.id = referred_player_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "moderation_reporter_update" on public.moderation_reports;
create policy "moderation_reporter_update"
  on public.moderation_reports for update
  using (
    exists (
      select 1 from public.players p
      where p.id = reporter_player_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = reporter_player_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "audit_actor_insert" on public.audit_events;
create policy "audit_actor_insert"
  on public.audit_events for insert
  with check (
    actor_player_id is not null
    and exists (
      select 1 from public.players p
      where p.id = actor_player_id and p.auth_user_id = auth.uid()
    )
  );
