-- Dropdown Tables Schema

-- 1. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Assign From (Given By) Table
CREATE TABLE IF NOT EXISTS assign_from (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. General Dropdown Options Table
-- This handles Machines, Parts, Areas, and any other custom categories
CREATE TABLE IF NOT EXISTS dropdown_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category TEXT NOT NULL, -- e.g., 'machine_name', 'machine_area', 'part_name', 'priority'
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category, value)
);

-- Initial Data Migration (Optional - Run if you want to preserve existing data)
/*
INSERT INTO departments (name)
SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != '';

INSERT INTO assign_from (name)
SELECT DISTINCT given_by FROM users WHERE given_by IS NOT NULL AND given_by != '';

INSERT INTO dropdown_options (category, value)
SELECT user_access, given_by FROM users WHERE role = 'custom_dropdown';
*/
