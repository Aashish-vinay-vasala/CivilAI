-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Same gap as migration 027, but for the tables that drive the Project Progress,
-- Active Workers, Safety Score and Active Projects widgets: none of them were ever
-- added to the supabase_realtime publication, so the dashboard only ever refreshed
-- those figures on navigation/manual reload, never on a live insert/update/delete
-- from another tab or teammate. useSupabaseSync already knows how to subscribe —
-- nothing was emitted until this runs.
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE workforce;
ALTER PUBLICATION supabase_realtime ADD TABLE safety_incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
