-- FINAL REPAIR SCRIPT FOR EA_TASKS_DONE
-- 1. Drop the problematic constraint
ALTER TABLE public.ea_tasks_done DROP CONSTRAINT IF EXISTS ea_tasks_done_status_check;

-- 2. Ensure all columns exist to match the Delegation pattern
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS planned_date TIMESTAMPTZ;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS task_description TEXT;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS submission_date TIMESTAMPTZ;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS given_by TEXT;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS next_extend_date TIMESTAMPTZ;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS task_start_date TIMESTAMPTZ;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS duration TEXT;
ALTER TABLE public.ea_tasks_done ADD COLUMN IF NOT EXISTS admin_done BOOLEAN DEFAULT FALSE;

-- 3. Migration: if there's old data in 'remarks', move it to 'reason' (the aligned field)
UPDATE public.ea_tasks_done SET reason = remarks WHERE reason IS NULL AND remarks IS NOT NULL;

-- 4. Add a more flexible constraint if desired (optional, but good for data integrity)
-- We use lowercase to stay consistent with the rest of the app
ALTER TABLE public.ea_tasks_done ADD CONSTRAINT ea_tasks_done_status_check 
CHECK (status IN ('pending', 'done', 'approved', 'rejected', 'extended', 'Pending', 'Done', 'Approved', 'Rejected', 'Extended'));
