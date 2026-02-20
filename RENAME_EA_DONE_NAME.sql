-- Rename 'name' column to 'doer_name' in ea_tasks_done table
-- Run this in Supabase SQL Editor

ALTER TABLE public.ea_tasks_done 
RENAME COLUMN name TO doer_name;
