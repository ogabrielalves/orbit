-- Global search. One FTS5 table (`search_index`) holds the searchable text of projects, boards,
-- tasks, notes and folders. Its rowid is the id of the matching `search_entries` row, which maps
-- the row back to the entity and keeps every write by key indexed (FTS5 cannot look rows up by an
-- unindexed column without scanning the whole table).
--
-- Projects, boards and tasks are kept in sync by the triggers below. Notes and folders live in
-- the vault, so the vault indexer feeds them (note rows are also dropped by a trigger).
CREATE TABLE search_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (
        entity_type IN ('project', 'board', 'task', 'note', 'folder')
    ),
    entity_id TEXT NOT NULL CHECK (length(entity_id) > 0),
    UNIQUE (entity_type, entity_id)
);

-- unicode61 with remove_diacritics: "acao" finds "ação". prefix indexes speed up "spr*" queries.
CREATE VIRTUAL TABLE search_index USING fts5(
    title,
    body,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3'
);

-- Existing data.
INSERT INTO search_entries (entity_type, entity_id) SELECT 'project', id FROM projects;
INSERT INTO search_entries (entity_type, entity_id) SELECT 'board', id FROM boards;
INSERT INTO search_entries (entity_type, entity_id) SELECT 'task', id FROM tasks;

INSERT INTO search_index (rowid, title, body)
SELECT e.id, p.name, p.description
FROM projects p JOIN search_entries e ON e.entity_type = 'project' AND e.entity_id = p.id;

INSERT INTO search_index (rowid, title, body)
SELECT e.id, b.name, ''
FROM boards b JOIN search_entries e ON e.entity_type = 'board' AND e.entity_id = b.id;

INSERT INTO search_index (rowid, title, body)
SELECT e.id, t.title, t.description
FROM tasks t JOIN search_entries e ON e.entity_type = 'task' AND e.entity_id = t.id;

-- Projects
CREATE TRIGGER projects_search_insert AFTER INSERT ON projects BEGIN
    INSERT INTO search_entries (entity_type, entity_id) VALUES ('project', NEW.id);
    INSERT INTO search_index (rowid, title, body)
    VALUES (last_insert_rowid(), NEW.name, NEW.description);
END;

CREATE TRIGGER projects_search_update AFTER UPDATE OF name, description ON projects BEGIN
    UPDATE search_index SET title = NEW.name, body = NEW.description
    WHERE rowid = (SELECT id FROM search_entries WHERE entity_type = 'project' AND entity_id = NEW.id);
END;

CREATE TRIGGER projects_search_delete AFTER DELETE ON projects BEGIN
    DELETE FROM search_index
    WHERE rowid = (SELECT id FROM search_entries WHERE entity_type = 'project' AND entity_id = OLD.id);
    DELETE FROM search_entries WHERE entity_type = 'project' AND entity_id = OLD.id;
END;

-- Boards
CREATE TRIGGER boards_search_insert AFTER INSERT ON boards BEGIN
    INSERT INTO search_entries (entity_type, entity_id) VALUES ('board', NEW.id);
    INSERT INTO search_index (rowid, title, body) VALUES (last_insert_rowid(), NEW.name, '');
END;

CREATE TRIGGER boards_search_update AFTER UPDATE OF name ON boards BEGIN
    UPDATE search_index SET title = NEW.name
    WHERE rowid = (SELECT id FROM search_entries WHERE entity_type = 'board' AND entity_id = NEW.id);
END;

CREATE TRIGGER boards_search_delete AFTER DELETE ON boards BEGIN
    DELETE FROM search_index
    WHERE rowid = (SELECT id FROM search_entries WHERE entity_type = 'board' AND entity_id = OLD.id);
    DELETE FROM search_entries WHERE entity_type = 'board' AND entity_id = OLD.id;
END;

-- Tasks (subtasks included)
CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks BEGIN
    INSERT INTO search_entries (entity_type, entity_id) VALUES ('task', NEW.id);
    INSERT INTO search_index (rowid, title, body)
    VALUES (last_insert_rowid(), NEW.title, NEW.description);
END;

CREATE TRIGGER tasks_search_update AFTER UPDATE OF title, description ON tasks BEGIN
    UPDATE search_index SET title = NEW.title, body = NEW.description
    WHERE rowid = (SELECT id FROM search_entries WHERE entity_type = 'task' AND entity_id = NEW.id);
END;

CREATE TRIGGER tasks_search_delete AFTER DELETE ON tasks BEGIN
    DELETE FROM search_index
    WHERE rowid = (SELECT id FROM search_entries WHERE entity_type = 'task' AND entity_id = OLD.id);
    DELETE FROM search_entries WHERE entity_type = 'task' AND entity_id = OLD.id;
END;

-- Notes: the vault indexer writes the text; deleting the note row removes it from the index.
CREATE TRIGGER notes_search_delete AFTER DELETE ON notes BEGIN
    DELETE FROM search_index
    WHERE rowid = (SELECT id FROM search_entries WHERE entity_type = 'note' AND entity_id = OLD.id);
    DELETE FROM search_entries WHERE entity_type = 'note' AND entity_id = OLD.id;
END;
