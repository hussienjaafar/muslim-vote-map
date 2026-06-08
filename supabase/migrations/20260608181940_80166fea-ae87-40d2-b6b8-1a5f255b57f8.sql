CREATE OR REPLACE FUNCTION public.org_daily_rollup(_org_id uuid, _since date)
RETURNS TABLE(day date, donations bigint, funds numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (transaction_date AT TIME ZONE 'America/New_York')::date AS day,
    count(*) AS donations,
    coalesce(sum(amount), 0) AS funds
  FROM public.actblue_transactions
  WHERE organization_id = _org_id
    AND (transaction_date AT TIME ZONE 'America/New_York')::date >= _since
  GROUP BY 1
$function$;

GRANT EXECUTE ON FUNCTION public.org_daily_rollup(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.org_new_donors_since(_org_id uuid, _since date)
 RETURNS TABLE(donor_email text, first_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lower(donor_email) as donor_email,
         min((transaction_date AT TIME ZONE 'America/New_York')::date) as first_date
  from public.actblue_transactions
  where organization_id = _org_id
    and donor_email is not null
  group by lower(donor_email)
  having min((transaction_date AT TIME ZONE 'America/New_York')::date) >= _since
$function$;