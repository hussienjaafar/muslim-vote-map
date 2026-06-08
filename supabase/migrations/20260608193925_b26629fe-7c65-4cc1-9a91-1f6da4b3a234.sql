ALTER TABLE public.actblue_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.daily_aggregated_metrics REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'actblue_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.actblue_transactions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_aggregated_metrics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_aggregated_metrics;
  END IF;
END $$;