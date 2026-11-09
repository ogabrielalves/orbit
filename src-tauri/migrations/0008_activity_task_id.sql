-- Owning top-level task of an entry: the task itself, its subtasks, and their checklist
-- items, comments and attachments all point at the same top-level task. No foreign key:
-- the log outlives the task.
ALTER TABLE activity_log ADD COLUMN task_id TEXT;

UPDATE activity_log
SET task_id = COALESCE(
    (SELECT COALESCE(t.parent_task_id, t.id) FROM tasks t WHERE t.id = activity_log.entity_id),
    activity_log.entity_id
)
WHERE entity_type = 'task';

UPDATE activity_log
SET task_id = (
    SELECT COALESCE(t.parent_task_id, t.id)
    FROM checklist_items c JOIN tasks t ON t.id = c.task_id
    WHERE c.id = activity_log.entity_id
)
WHERE entity_type = 'checklist_item';

UPDATE activity_log
SET task_id = (
    SELECT COALESCE(t.parent_task_id, t.id)
    FROM comments c JOIN tasks t ON t.id = c.task_id
    WHERE c.id = activity_log.entity_id
)
WHERE entity_type = 'comment';

CREATE INDEX idx_activity_log_task_created ON activity_log (task_id, created_at DESC)
WHERE task_id IS NOT NULL;
