ALTER TABLE columns ADD COLUMN kind TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (kind IN ('todo', 'in_progress', 'done'));

-- Existing boards: the first column is a todo stage and the last one is done,
-- matching what the dashboard used to infer from position.
UPDATE columns SET kind = 'todo'
WHERE position = (SELECT MIN(c.position) FROM columns c WHERE c.board_id = columns.board_id);

UPDATE columns SET kind = 'done'
WHERE position = (SELECT MAX(c.position) FROM columns c WHERE c.board_id = columns.board_id)
  AND position <> (SELECT MIN(c.position) FROM columns c WHERE c.board_id = columns.board_id);
