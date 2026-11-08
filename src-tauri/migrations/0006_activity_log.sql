CREATE TABLE activity_log (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL CHECK (
        entity_type IN (
            'project', 'board', 'column', 'task', 'checklist_item',
            'comment', 'tag', 'attachment', 'note', 'folder'
        )
    ),
    entity_id TEXT NOT NULL CHECK (length(entity_id) > 0),
    action TEXT NOT NULL CHECK (
        action IN (
            'created', 'updated', 'deleted', 'archived', 'restored',
            'moved', 'completed', 'reopened', 'duplicated'
        )
    ),
    changes TEXT CHECK (changes IS NULL OR (json_valid(changes) AND json_type(changes) = 'object')),
    created_at TEXT NOT NULL
);

CREATE INDEX idx_activity_log_entity_created ON activity_log (entity_type, entity_id, created_at DESC);

CREATE INDEX idx_activity_log_created ON activity_log (created_at DESC);
