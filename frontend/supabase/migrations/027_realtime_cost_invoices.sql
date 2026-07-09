-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- cost_entries and invoices drive the AC/CPI figures on EVM and the committed-spend
-- figures on Cost & Budget/Overview, but unlike `notifications` (see migration 001)
-- neither table was ever added to the supabase_realtime publication, so postgres_changes
-- events for them were never delivered to any connected client — the frontend's
-- useSupabaseSync hook can subscribe to them, but nothing is emitted until this runs.
ALTER PUBLICATION supabase_realtime ADD TABLE cost_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
