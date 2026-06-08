create or replace function public.org_hourly_rollup(_org_id uuid, _day date)
returns table(hour int, donations bigint, funds numeric)
language sql stable security definer set search_path = public as $$
  select extract(hour from (transaction_date at time zone 'America/New_York'))::int as hour,
         count(*) as donations,
         coalesce(sum(amount), 0) as funds
  from public.actblue_transactions
  where organization_id = _org_id
    and (transaction_date at time zone 'America/New_York')::date = _day
    and public.can_access_organization_data(auth.uid(), _org_id)
  group by 1
$$;

grant execute on function public.org_hourly_rollup(uuid, date) to authenticated;