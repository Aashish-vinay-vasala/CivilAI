-- EVM was weighting every schedule task equally (a simple average of planned/actual
-- progress) instead of by the task's cost weight, and evm_snapshots had no way to
-- guarantee one row per project per day, so recalculating EVM repeatedly would have
-- produced duplicate history rows once the backend started upserting snapshots.

-- Per-task budget, used to weight each task's contribution to PV/EV.
ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS budget NUMERIC DEFAULT 0;

-- Collapse any pre-existing duplicate (project_id, snapshot_date) rows before the
-- unique constraint is added, keeping one row per pair (tie-break on id so exact
-- created_at ties still resolve to a single survivor).
DELETE FROM evm_snapshots a USING evm_snapshots b
  WHERE a.project_id = b.project_id
    AND a.snapshot_date = b.snapshot_date
    AND (a.created_at, a.id) < (b.created_at, b.id);

ALTER TABLE evm_snapshots
  ADD CONSTRAINT evm_snapshots_project_date_unique UNIQUE (project_id, snapshot_date);

NOTIFY pgrst, 'reload schema';
