CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    board_id TEXT,
    column_id TEXT,
    parent_task_id TEXT REFERENCES tasks (id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TEXT CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'),
    position TEXT NOT NULL CHECK (
        position GLOB '[0-9A-Za-z]*'
        AND position NOT GLOB '*[^0-9A-Za-z]*'
        AND position NOT GLOB '*0'
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    archived_at TEXT,
    CHECK ((board_id IS NULL) = (column_id IS NULL)),
    CHECK (parent_task_id IS NULL OR parent_task_id <> id),
    FOREIGN KEY (board_id, project_id) REFERENCES boards (id, project_id),
    FOREIGN KEY (column_id, board_id) REFERENCES columns (id, board_id)
);

CREATE INDEX idx_tasks_board_column_position ON tasks (board_id, column_id, position)
WHERE board_id IS NOT NULL;

CREATE INDEX idx_tasks_column_position ON tasks (column_id, position)
WHERE column_id IS NOT NULL;

CREATE INDEX idx_tasks_project_archived_updated ON tasks (project_id, archived_at, updated_at DESC);

CREATE INDEX idx_tasks_parent_position ON tasks (parent_task_id, position)
WHERE parent_task_id IS NOT NULL;

CREATE INDEX idx_tasks_backlog_position ON tasks (position)
WHERE board_id IS NULL AND parent_task_id IS NULL AND archived_at IS NULL;

CREATE INDEX idx_tasks_backlog_project_position ON tasks (project_id, position)
WHERE board_id IS NULL AND parent_task_id IS NULL AND archived_at IS NULL;

CREATE INDEX idx_tasks_due_date ON tasks (due_date)
WHERE due_date IS NOT NULL AND archived_at IS NULL;
