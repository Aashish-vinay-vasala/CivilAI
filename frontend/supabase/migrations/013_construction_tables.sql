-- Construction Management Tables

CREATE TABLE IF NOT EXISTS punch_list (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  item        TEXT NOT NULL,
  location    TEXT DEFAULT '',
  assigned_to TEXT DEFAULT '',
  status      TEXT DEFAULT 'open',
  priority    TEXT DEFAULT 'medium',
  due_date    DATE,
  description TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  closed_date DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfis (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  rfi_number     TEXT DEFAULT '',
  subject        TEXT NOT NULL,
  question       TEXT DEFAULT '',
  submitted_by   TEXT DEFAULT '',
  assigned_to    TEXT DEFAULT '',
  status         TEXT DEFAULT 'open',
  priority       TEXT DEFAULT 'medium',
  due_date       DATE,
  response       TEXT DEFAULT '',
  responded_date DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submittals (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  submittal_number  TEXT DEFAULT '',
  title             TEXT NOT NULL,
  type              TEXT DEFAULT '',
  submitted_by      TEXT DEFAULT '',
  reviewed_by       TEXT DEFAULT '',
  status            TEXT DEFAULT 'pending',
  submitted_date    DATE,
  review_date       DATE,
  revision          INTEGER DEFAULT 0,
  description       TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  report_date      DATE NOT NULL,
  weather          TEXT DEFAULT '',
  temperature      FLOAT,
  workers_on_site  INTEGER DEFAULT 0,
  work_completed   TEXT DEFAULT '',
  issues           TEXT DEFAULT '',
  materials_used   TEXT DEFAULT '',
  equipment_used   TEXT DEFAULT '',
  safety_incidents TEXT DEFAULT '',
  created_by       TEXT DEFAULT '',
  ai_summary       TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_minutes (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  meeting_type TEXT DEFAULT '',
  attendees    TEXT DEFAULT '',
  location     TEXT DEFAULT '',
  agenda       TEXT DEFAULT '',
  discussion   TEXT DEFAULT '',
  action_items TEXT DEFAULT '',
  next_meeting DATE,
  created_by   TEXT DEFAULT '',
  ai_summary   TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_codes (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  code            TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT DEFAULT '',
  budgeted_amount FLOAT DEFAULT 0,
  actual_amount   FLOAT DEFAULT 0,
  unit            TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evm_snapshots (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  planned_value FLOAT DEFAULT 0,
  earned_value  FLOAT DEFAULT 0,
  actual_cost   FLOAT DEFAULT 0,
  cpi           FLOAT DEFAULT 1,
  spi           FLOAT DEFAULT 1,
  bac           FLOAT DEFAULT 0,
  eac           FLOAT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomaly_history (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  anomaly_type TEXT DEFAULT '',
  severity     TEXT DEFAULT '',
  title        TEXT DEFAULT '',
  description  TEXT DEFAULT '',
  deviation    FLOAT DEFAULT 0,
  category     TEXT DEFAULT '',
  detected_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
