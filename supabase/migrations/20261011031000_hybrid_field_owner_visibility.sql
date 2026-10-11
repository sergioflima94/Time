-- UPDATE also needs SELECT visibility. A venue owner must be able to load a
-- physical field linked to another team without gaining access to that team's roster.
create policy hybrid_fields_owner_select on public.fields for select to authenticated
 using (public.platform_account_allowed() and public.is_establishment_owner(establishment_id));
