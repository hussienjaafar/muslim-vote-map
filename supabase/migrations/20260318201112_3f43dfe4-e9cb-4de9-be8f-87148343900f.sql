INSERT INTO storage.buckets (id, name, public) VALUES ('geojson', 'geojson', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access on geojson bucket" ON storage.objects FOR SELECT USING (bucket_id = 'geojson');