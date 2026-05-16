CREATE TABLE IF NOT EXISTS invoices (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid          REFERENCES projects(id) ON DELETE CASCADE,
  invoice_number text          NOT NULL,
  contractor     text          NOT NULL,
  amount         numeric(12,2) NOT NULL DEFAULT 0,
  due_date       date,
  paid_date      date,
  status         text          NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('received', 'pending', 'overdue')),
  retainage_pct  numeric(5,2)  DEFAULT 0,
  description    text,
  created_at     timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date   ON invoices(due_date);
