-- Repetir uma confirmação não cria outra licença; revisão de preço não muda a oferta silenciosamente.
alter table public.platform_commercial_agreements add column request_id uuid unique;
alter table public.platform_commercial_agreements add column request_payload jsonb;
alter function public.save_commercial_agreement(jsonb,text) rename to save_commercial_agreement_internal;
revoke all on function public.save_commercial_agreement_internal(jsonb,text) from public,anon,authenticated;
create function public.save_commercial_agreement(p_payload jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare request_now uuid; existing public.platform_commercial_agreements; plan_price numeric; agreement_id uuid; request_data jsonb;
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário concede condições comerciais' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or length(trim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'Condição ou motivo inválidos'; end if;
  request_now:=(p_payload->>'requestId')::uuid;
  if request_now is null then raise exception 'Confirmação precisa de identificador único'; end if;
  request_data:=jsonb_build_object('payload',p_payload,'reason',trim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended(request_now::text,0));
  select * into existing from public.platform_commercial_agreements where request_id=request_now;
  if existing.id is not null then
    if existing.created_by<>auth.uid() or existing.request_payload is distinct from request_data then raise exception 'Confirmação já usada para outra condição'; end if;
    return existing.id;
  end if;
  select monthly_price into plan_price from public.commercial_plans where id=(p_payload->>'planId')::uuid and active for share;
  if jsonb_typeof(p_payload->'expectedMonthlyPrice') is distinct from 'number' or (p_payload->>'expectedMonthlyPrice')::numeric is distinct from plan_price then
    raise exception 'Preço do catálogo mudou. Atualize e revise a oferta' using errcode='40001';
  end if;
  agreement_id:=public.save_commercial_agreement_internal(p_payload,p_reason);
  update public.platform_commercial_agreements set request_id=request_now,request_payload=request_data where id=agreement_id;
  return agreement_id;
end $$;
revoke all on function public.save_commercial_agreement(jsonb,text) from public;
grant execute on function public.save_commercial_agreement(jsonb,text) to authenticated;
