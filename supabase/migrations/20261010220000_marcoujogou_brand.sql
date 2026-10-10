-- Rebrand only future booking notes; preserve existing history and RPC security.
-- Do not edit an applied migration or change function ACLs/signatures.
do $brand$
declare
  definition text;
begin
  select pg_get_functiondef('public.growth_action(text,jsonb)'::regprocedure) into definition;
  if position('BoraJogo: oferta confirmada, pagamento separado' in definition) > 0 then
    execute replace(definition,
      'BoraJogo: oferta confirmada, pagamento separado',
      'MarcouJogou: oferta confirmada, pagamento separado');
  elsif position('MarcouJogou: oferta confirmada, pagamento separado' in definition) = 0 then
    raise exception 'Unexpected growth_action definition: review branding migration';
  end if;
end $brand$;
