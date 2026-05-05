-- Add primary election columns to states
ALTER TABLE public.voter_impact_states ADD COLUMN IF NOT EXISTS primary_2024 integer;
ALTER TABLE public.voter_impact_states ADD COLUMN IF NOT EXISTS primary_2024_pct numeric;
ALTER TABLE public.voter_impact_states ADD COLUMN IF NOT EXISTS primary_2022 integer;
ALTER TABLE public.voter_impact_states ADD COLUMN IF NOT EXISTS primary_2022_pct numeric;

-- Add primary election, 2022 general, registration, and total donor columns to districts
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS political_donors integer;
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS primary_2024 integer;
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS primary_2024_pct numeric;
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS primary_2022 integer;
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS primary_2022_pct numeric;
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS voted_2022 integer;
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS turnout_2022_pct numeric;
ALTER TABLE public.voter_impact_districts ADD COLUMN IF NOT EXISTS registration_pct numeric;

-- Clean stale data from previous incorrect imports:
-- turnout_pct was incorrectly populated with registration % values
-- donor_platinum_count was incorrectly populated with total donor counts
UPDATE public.voter_impact_districts SET turnout_pct = NULL, donor_platinum_count = NULL;
