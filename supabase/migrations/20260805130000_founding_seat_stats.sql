-- Public read of founding seat counts only (no user data).
create or replace function public.founding_seat_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cap', 50,
    'claimed', (
      select count(*)::int
      from public.entitlements
      where source = 'founding'
        and status = 'active'
    ),
    'remaining', greatest(
      0,
      50 - (
        select count(*)::int
        from public.entitlements
        where source = 'founding'
          and status = 'active'
      )
    ),
    'open', (
      select count(*)::int
      from public.entitlements
      where source = 'founding'
        and status = 'active'
    ) < 50
  );
$$;

revoke all on function public.founding_seat_stats() from public;
grant execute on function public.founding_seat_stats() to anon, authenticated, service_role;
