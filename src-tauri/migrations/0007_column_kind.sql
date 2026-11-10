ALTER TABLE columns ADD COLUMN kind TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (kind IN ('todo', 'in_progress', 'done'));

UPDATE columns SET kind = 'todo'
WHERE position = (SELECT MIN(c.position) FROM columns c WHERE c.board_id = columns.board_id);

UPDATE columns SET kind = 'done'
WHERE position = (SELECT MAX(c.position) FROM columns c WHERE c.board_id = columns.board_id)
  AND position <> (SELECT MIN(c.position) FROM columns c WHERE c.board_id = columns.board_id);
