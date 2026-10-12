alter table payment_gateway_connections add column verified_collector_id text;
create function credit_gateway_connection(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$declare me uuid;v uuid:=(p_data->>'venueId')::uuid;c payment_gateway_connections;k uuid;creds jsonb;oldcreds jsonb;preserve boolean:=false;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Serviço não autorizado.';end if;
 select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
 if not credit_actor_allowed(me) or not exists(select 1 from establishments where id=v and owner_player_id=me) then raise exception 'FATURA: Só o dono conecta o recebimento.';end if;
 if p_action='access' then return '{}';end if;
 if p_action<>'save' or p_data->>'provider' not in('mercado_pago','picpay') or (p_data->>'confirmed')::boolean is distinct from true then raise exception 'FATURA: Confirme a configuração e escolha um gateway suportado.';end if;
 perform pg_advisory_xact_lock(hashtext('credit-gateway:'||v::text));select * into c from payment_gateway_connections where establishment_id=v for update;
 if exists(select 1 from sale_payment_intents x join service_tabs t on t.id=x.tab_id where t.establishment_id=v and x.status='pending') then raise exception 'FATURA: Resolva as cobranças pendentes de comanda antes de mudar o recebimento.';end if;
 creds:=p_data->'credentials';if jsonb_typeof(creds) is distinct from 'object' or coalesce(length(creds->>'webhookSecret'),0)<16 or coalesce(p_data->>'collectorId','')='' then raise exception 'FATURA: Credenciais verificadas e segredo de webhook obrigatórios.';end if;
 select decrypted_secret::jsonb into oldcreds from vault.decrypted_secrets where id=c.credential_secret_id;
 preserve:=c.status='connected' and c.provider=p_data->>'provider' and (c.verified_collector_id=p_data->>'collectorId' or c.provider='mercado_pago' and oldcreds->>'accessToken'=creds->>'accessToken' or c.provider='picpay' and oldcreds->>'clientId'=creds->>'clientId' and oldcreds->>'clientSecret'=creds->>'clientSecret');
 k:=vault.create_secret(creds::text);
 insert into payment_gateway_connections(establishment_id,provider,status,account_label,pix_enabled,card_enabled,contactless_enabled,credential_secret_id,connected_at,verified_collector_id)
 values(v,p_data->>'provider','connected',left(p_data->>'accountLabel',100),true,false,false,k,now(),p_data->>'collectorId')
 on conflict(establishment_id) do update set provider=excluded.provider,status='connected',account_label=excluded.account_label,pix_enabled=true,card_enabled=coalesce(preserve,false) and c.card_enabled,contactless_enabled=coalesce(preserve,false) and c.contactless_enabled,credential_secret_id=k,connected_at=now(),updated_at=now(),verified_collector_id=excluded.verified_collector_id returning * into c;
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_gateway_connected',c.id,jsonb_build_object('provider',c.provider,'credential_verified',true));perform venue_ping(v);
 return jsonb_build_object('id',c.id,'provider',c.provider,'label',c.account_label);
end$$;
revoke all on function credit_gateway_connection(text,jsonb) from public,anon,authenticated;
grant execute on function credit_gateway_connection(text,jsonb) to service_role;
