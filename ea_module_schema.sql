-- EA Module Database Schema
-- 1. Active Tasks Table
CREATE TABLE IF NOT EXISTS public.ea_tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doer_name TEXT NOT NULL,
    phone_number TEXT,
    planned_date TIMESTAMPTZ NOT NULL,
    task_description TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'extend')),
    given_by TEXT,
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
    status TEXT CHECK (status IN ('done', 'extend')),
    submission_date TIMESTAMPTZ DEFAULT NOW(),
    remarks TEXT,
    image_url TEXT,
    given_by TEXT
);

-- Enable Row Level Security (Optional, based on your Supabase setup)
-- ALTER TABLE public.ea_tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.ea_tasks_done ENABLE ROW LEVEL SECURITY;

-- Note: In the Supabase SQL Editor, make sure the "gen_random_uuid()" function is available (it is by default in newer versions).
