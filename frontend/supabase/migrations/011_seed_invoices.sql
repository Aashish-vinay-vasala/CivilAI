-- Sample invoice data — run in Supabase SQL Editor
-- Run AFTER 009_invoices.sql

INSERT INTO invoices (invoice_number, contractor, amount, due_date, status, description) VALUES
  ('INV-2025-001', 'Apex Structural Inc.',      245000.00, '2025-03-15', 'received', 'Foundation & structural steel phase 1'),
  ('INV-2025-002', 'BlueLine MEP Services',     118500.00, '2025-04-01', 'received', 'Mechanical, electrical & plumbing rough-in'),
  ('INV-2025-003', 'SkyBuild Concrete Co.',     185000.00, '2025-04-20', 'received', 'Concrete pour — floors 1-4'),
  ('INV-2025-004', 'IronClad Roofing LLC',       72000.00, '2025-05-10', 'pending',  'Roof membrane and flashing installation'),
  ('INV-2025-005', 'PrecisionDrywall Corp.',     54000.00, '2025-05-25', 'pending',  'Interior drywall — office levels 2-5'),
  ('INV-2025-006', 'Horizon HVAC Solutions',     96000.00, '2025-04-05', 'overdue',  'HVAC equipment supply and installation'),
  ('INV-2025-007', 'Coastal Electrical Works',  138000.00, '2025-04-12', 'overdue',  'Main electrical switchgear & distribution'),
  ('INV-2025-008', 'TerraForm Landscaping',      28500.00, '2025-06-01', 'pending',  'Site grading and drainage system'),
  ('INV-2025-009', 'SafeGuard Fire Systems',     41000.00, '2025-06-15', 'pending',  'Fire suppression system installation'),
  ('INV-2025-010', 'GlassWorks Facade Ltd.',    210000.00, '2025-05-30', 'pending',  'Curtain wall glazing — south elevation')
ON CONFLICT DO NOTHING;
