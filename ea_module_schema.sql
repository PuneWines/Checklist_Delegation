-- EA Module Database Schema
-- 1. Active Tasks Table
CREATE TABLE IF NOT EXISTS public.ea_tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doer_name TEXT NOT NULL,
    phone_number TEXT,
    planned_date TIMESTAMPTZ NOT NULL,
    task_description TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'extended')),
    given_by TEXT,
    extended_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Task History & Progress Table
CREATE TABLE IF NOT EXISTS public.ea_tasks_done (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.ea_tasks(task_id) ON DELETE SET NULL,
    doer_name TEXT,
    phone_number TEXT,
    planned_date TIMESTAMPTZ,
    task_description TEXT,
    status TEXT CHECK (status IN ('done', 'extended')),
    submission_date TIMESTAMPTZ DEFAULT NOW(),
    remarks TEXT,
    image_url TEXT,
    given_by TEXT,
    extended_date TIMESTAMPTZ
);

-- Enable Row Level Security
ALTER TABLE public.ea_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ea_tasks_done ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ea_tasks
-- Allow authenticated users to view all tasks
CREATE POLICY "Allow authenticated users to view ea_tasks"
ON public.ea_tasks
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert tasks
CREATE POLICY "Allow authenticated users to insert ea_tasks"
ON public.ea_tasks
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update tasks
CREATE POLICY "Allow authenticated users to update ea_tasks"
ON public.ea_tasks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete tasks
CREATE POLICY "Allow authenticated users to delete ea_tasks"
ON public.ea_tasks
FOR DELETE
TO authenticated
USING (true);

-- RLS Policies for ea_tasks_done
-- Allow authenticated users to view all completed tasks
CREATE POLICY "Allow authenticated users to view ea_tasks_done"
ON public.ea_tasks_done
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert completed tasks
CREATE POLICY "Allow authenticated users to insert ea_tasks_done"
ON public.ea_tasks_done
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update completed tasks
CREATE POLICY "Allow authenticated users to update ea_tasks_done"
ON public.ea_tasks_done
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete completed tasks
CREATE POLICY "Allow authenticated users to delete ea_tasks_done"
ON public.ea_tasks_done
FOR DELETE
TO authenticated
USING (true);

-- Note: These policies allow all authenticated users full access.
-- You may want to restrict based on user roles or specific conditions later.
