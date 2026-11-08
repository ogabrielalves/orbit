CREATE TABLE checklist_items (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
    position TEXT NOT NULL CHECK (
        position GLOB '[0-9A-Za-z]*'
        AND position NOT GLOB '*[^0-9A-Za-z]*'
        AND position NOT GLOB '*0'
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_checklist_items_task_position ON checklist_items (task_id, position);

CREATE TABLE comments (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_comments_task_created ON comments (task_id, created_at);

CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_tags_name_unique ON tags (name COLLATE NOCASE);

CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
) WITHOUT ROWID;

CREATE INDEX idx_task_tags_tag_task ON task_tags (tag_id, task_id);

CREATE TABLE attachments (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    file_name TEXT NOT NULL CHECK (length(trim(file_name)) > 0),
    stored_name TEXT NOT NULL UNIQUE CHECK (length(trim(stored_name)) > 0),
    mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) > 0),
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    created_at TEXT NOT NULL
);

CREATE INDEX idx_attachments_task_created ON attachments (task_id, created_at);
