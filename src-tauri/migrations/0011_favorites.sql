-- Entities the user pinned to the sidebar, in the order they chose.
--
-- There is no foreign key because the target lives in different tables (and, for folders, on
-- disk). Rows for projects, boards, tasks and notes are removed by the triggers below when the
-- entity is deleted, which also covers cascading deletes. Folder favorites are kept in step by
-- the folders service (rename, move, delete) and pruned when the vault is reindexed.
CREATE TABLE favorites (
    entity_type TEXT NOT NULL CHECK (
        entity_type IN ('project', 'board', 'task', 'note', 'folder')
    ),
    entity_id TEXT NOT NULL CHECK (length(entity_id) > 0),
    position TEXT NOT NULL CHECK (
        position GLOB '[0-9A-Za-z]*'
        AND position NOT GLOB '*[^0-9A-Za-z]*'
        AND position NOT GLOB '*0'
    ),
    created_at TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
) WITHOUT ROWID;

CREATE UNIQUE INDEX idx_favorites_position ON favorites (position);

CREATE TRIGGER projects_favorites_delete AFTER DELETE ON projects BEGIN
    DELETE FROM favorites WHERE entity_type = 'project' AND entity_id = OLD.id;
END;

CREATE TRIGGER boards_favorites_delete AFTER DELETE ON boards BEGIN
    DELETE FROM favorites WHERE entity_type = 'board' AND entity_id = OLD.id;
END;

CREATE TRIGGER tasks_favorites_delete AFTER DELETE ON tasks BEGIN
    DELETE FROM favorites WHERE entity_type = 'task' AND entity_id = OLD.id;
END;

CREATE TRIGGER notes_favorites_delete AFTER DELETE ON notes BEGIN
    DELETE FROM favorites WHERE entity_type = 'note' AND entity_id = OLD.id;
END;
