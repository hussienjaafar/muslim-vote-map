ALTER TABLE public.actblue_csv_jobs
  ADD COLUMN IF NOT EXISTS date_range_start date,
  ADD COLUMN IF NOT EXISTS date_range_end date;