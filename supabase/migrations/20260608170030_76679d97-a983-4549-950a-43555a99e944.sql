create or replace function public.org_new_donors_since(_org_id uuid, _since date)
returns table(donor_email text, first_date date)
language sql
stable
security definer
set search_path = public
as $$
  select lower(donor_email) as donor_email, min(transaction_date)::date as first_date
  from public.actblue_transactions
  where organization_id = _org_id
    and donor_email is not null
  group by lower(donor_email)
  having min(transaction_date)::date >= _since
$$;

grant execute on function public.org_new_donors_since(uuid, date) to service_role, authenticated;