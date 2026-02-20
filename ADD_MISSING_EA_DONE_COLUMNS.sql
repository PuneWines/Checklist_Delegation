-- Add missing columns to ea_tasks_done to support full data snapshots
-- This aligns EA task history EXACTLY with the delegation task pattern
-- Run this in the Supabase SQL Editor
ALTER TABLE public.ea_tasks_done 
ADD COLUMN IF NOT EXISTS name TEXT, -- Matches delegation (snapshot of doer_name)
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS planned_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS task_description TEXT,
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS submission_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reason TEXT, -- Matches delegation (snapshot of remarks)
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS given_by TEXT,
ADD COLUMN IF NOT EXISTS next_extend_date TIMESTAMPTZ, -- Matches delegation (snapshot of extended_date)
ADD COLUMN IF NOT EXISTS task_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS admin_done BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS duration TEXT;

-- Update indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_ea_tasks_done_submission_date ON public.ea_tasks_done(submission_date);
CREATE INDEX IF NOT EXISTS idx_ea_tasks_done_name ON public.ea_tasks_done(name);
