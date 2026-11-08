CREATE TABLE boards (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    UNIQUE (id, project_id)
);

CREATE INDEX idx_boards_project_archived_created ON boards (project_id, archived_at, created_at);

CREATE TABLE columns (
    id TEXT PRIMARY KEY NOT NULL,
    board_id TEXT NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    position TEXT NOT NULL CHECK (
        position GLOB '[0-9A-Za-z]*'
        AND position NOT GLOB '*[^0-9A-Za-z]*'
        AND position NOT GLOB '*0'
    ),
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (board_id, position),
    UNIQUE (id, board_id)
);
