CREATE TABLE notes (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
    path TEXT NOT NULL UNIQUE CHECK (
        length(trim(path)) > 0
        AND path NOT GLOB '/*'
        AND instr(path, char(92)) = 0
        AND lower(path) GLOB '*.md'
    ),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    title_key TEXT NOT NULL CHECK (length(title_key) > 0),
    hash TEXT NOT NULL CHECK (length(hash) = 64),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
);

CREATE INDEX idx_notes_title_key ON notes (title_key, created_at);

CREATE TABLE note_links (
    source_note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    target_key TEXT NOT NULL CHECK (length(target_key) > 0),
    target_title TEXT NOT NULL CHECK (length(trim(target_title)) > 0),
    link_count INTEGER NOT NULL DEFAULT 1 CHECK (link_count >= 1),
    PRIMARY KEY (source_note_id, target_key)
) WITHOUT ROWID;

CREATE INDEX idx_note_links_target ON note_links (target_key, source_note_id);
