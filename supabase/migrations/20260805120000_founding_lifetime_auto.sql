-- Auto-grant Lifetime Premium to the first 50 accounts (source = 'founding').
-- Safe under concurrency via transaction advisory lock.
-- Called from auth signup trigger and from claim_founding_seat() on login.

create or replace function public.try_grant_founding_lifetime(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cap constant int := 50;
  founding_n int;
  current_status text;
  current_source text;
begin
  if p_user_id is null then
    return jsonb_build_object('premium', false, 'granted', false, 'reason', 'no_user');
  end if;

  -- Serialize grants so concurrent signups cannot blow past the cap.
  perform pg_advisory_xact_lock(8420150);

  select e.status, e.source
    into current_status, current_source
  from public.entitlements e
  where e.user_id = p_user_id
  for update;

  if current_status = 'active' then
    return jsonb_build_object(
      'premium', true,
      'granted', false,
      'reason', 'already_active',
      'source', current_source
    );
  end if;

  if current_status in ('refunded', 'revoked') then
    return jsonb_build_object(
      'premium', false,
      'granted', false,
      'reason', current_status
    );
  end if;

  select count(*)::int into founding_n
  from public.entitlements
  where source = 'founding'
    and status = 'active';

  if founding_n >= cap then
    insert into public.entitlements (user_id, product_key, status, updated_at)
    values (p_user_id, 'briskread_lifetime', 'inactive', now())
    on conflict (user_id) do nothing;

    return jsonb_build_object(
      'premium', false,
      'granted', false,
      'reason', 'cap_reached',
      'remaining', 0
    );
  end if;

  insert into public.entitlements (
    user_id,
    product_key,
    status,
    source,
    granted_at,
    updated_at
  )
  values (
    p_user_id,
    'briskread_lifetime',
    'active',
    'founding',
    now(),
    now()
  )
  on conflict (user_id) do update set
    product_key = 'briskread_lifetime',
    status = 'active',
    source = 'founding',
    granted_at = coalesce(public.entitlements.granted_at, now()),
    updated_at = now()
  where public.entitlements.status is distinct from 'active';

  select e.status, e.source
    into current_status, current_source
  from public.entitlements e
  where e.user_id = p_user_id;

  return jsonb_build_object(
    'premium', current_status = 'active',
    'granted', current_source = 'founding' and current_status = 'active',
    'reason', case
      when current_status = 'active' and current_source = 'founding' then 'founding_granted'
      when current_status = 'active' then 'already_active'
      else 'not_granted'
    end,
    'source', current_source,
    'remaining', greatest(0, cap - (
      select count(*)::int from public.entitlements
      where source = 'founding' and status = 'active'
    ))
  );
end;
$$;

revoke all on function public.try_grant_founding_lifetime(uuid) from public, anon, authenticated;
grant execute on function public.try_grant_founding_lifetime(uuid) to service_role;

-- Authenticated clients claim for themselves only (auth.uid()).
create or replace function public.claim_founding_seat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('premium', false, 'granted', false, 'reason', 'not_authenticated');
  end if;
  return public.try_grant_founding_lifetime(uid);
end;
$$;

revoke all on function public.claim_founding_seat() from public, anon;
grant execute on function public.claim_founding_seat() to authenticated, service_role;

-- On signup: profile + attempt founding Lifetime (or inactive row if cap full).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  perform public.try_grant_founding_lifetime(new.id);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin, service_role;
