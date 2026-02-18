-- ============================================================
-- ADD DURATION COLUMN TO ALL TASK TABLES
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Checklist Tasks table
ALTER TABLE checklist
ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT NULL;

-- 2. Delegation table (one-time checklist tasks)
ALTER TABLE delegation
ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT NULL;

-- 3. Maintenance Tasks table
ALTER TABLE maintenance_tasks
ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT NULL;

-- 4. Repair Tasks table
ALTER TABLE repair_tasks
ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT NULL;

-- 5. EA Tasks table
ALTER TABLE ea_tasks
ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT NULL;

-- ============================================================
-- DONE! All tables now have a 'duration' column (TEXT, nullable)
-- ============================================================
