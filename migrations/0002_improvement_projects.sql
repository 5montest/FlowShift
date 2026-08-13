CREATE TABLE improvement_projects (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'VALIDATING', 'ADOPTED', 'REJECTED', 'ON_HOLD')),
  project_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX improvement_projects_user_updated ON improvement_projects(user_id, updated_at DESC);
