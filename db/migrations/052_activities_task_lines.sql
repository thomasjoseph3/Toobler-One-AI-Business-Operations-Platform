-- F08 slice 4: tasks on the timeline. Two more lines the system writes by itself: "task_created" (a task was added for a lead or a person)
-- and "task_completed" (a task was ticked off). Like the stage lines they are written by the activities module when the tasks
-- module's events arrive. `details` holds the task's words and kind at that moment (read from the task, never carried by the event).

ALTER TABLE app.activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE app.activities ADD CONSTRAINT activities_kind_check
  CHECK (kind IN ('note', 'lead_created', 'stage_changed', 'task_created', 'task_completed'));
