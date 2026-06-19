-- Storage policies for deal documents bucket
-- Create bucket in Supabase Dashboard: deal-documents (private)

CREATE POLICY "Authenticated users can read deal documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'deal-documents');

CREATE POLICY "Authenticated users can upload deal documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'deal-documents');

CREATE POLICY "Authenticated users can update deal documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'deal-documents')
WITH CHECK (bucket_id = 'deal-documents');

CREATE POLICY "Authenticated users can delete deal documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'deal-documents');

-- Enable realtime for live board updates
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE financial_snapshots;
