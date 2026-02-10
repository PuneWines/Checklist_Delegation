-- SAMPLE DATA FOR DROPDOWN TABLES AND USERS

-- 1. Departments
INSERT INTO departments (name) VALUES 
('Human Resources'),
('IT Department'),
('Marketing'),
('Sales'),
('Operations'),
('Finance'),
('Legal'),
('Customer Support')
ON CONFLICT (name) DO NOTHING;

-- 2. Assign From (Given By)
INSERT INTO assign_from (name) VALUES 
('CEO'),
('Director'),
('General Manager'),
('Department Head'),
('Team Lead'),
('Project Manager'),
('Self')
ON CONFLICT (name) DO NOTHING;

-- 3. Custom Dropdown Options (Categories)
INSERT INTO dropdown_options (category, value) VALUES 
-- Task Priorities
('Task Priority', 'Urgent'),
('Task Priority', 'High'),
('Task Priority', 'Medium'),
('Task Priority', 'Low'),
-- Project Types
('Project Type', 'Internal'),
('Project Type', 'Client'),
('Project Type', 'Research'),
-- Leave Types
('Leave Type', 'Sick Leave'),
('Leave Type', 'Casual Leave'),
('Leave Type', 'Earned Leave'),
('Leave Type', 'Work From Home'),
-- Expense Categories
('Expense Category', 'Travel'),
('Expense Category', 'Food & Beverages'),
('Expense Category', 'Accommodation'),
('Expense Category', 'Office Supplies'),
-- Meeting Types
('Meeting Type', 'Daily Standup'),
('Meeting Type', 'Weekly Review'),
('Meeting Type', 'Monthly Planning'),
('Meeting Type', 'Client Call')
ON CONFLICT (category, value) DO NOTHING;

-- 4. Users (Sample Data)
-- We use 'ON CONFLICT DO NOTHING' assuming 'email_id' or 'employee_id' is unique.
-- If not, we skip duplicates based on 'user_name' if unique constraint exists there, 
-- or rely on manual clean up if no unique constraint other than ID.
-- However, since the error was on ID, we just want to safely insert without specifying ID.

INSERT INTO users (user_name, email_id, password, number, employee_id, role, status, user_access) 
SELECT * FROM (VALUES 
  ('Admin User', 'admin@botivate.com', 'password123', 9876543210, 'EMP001', 'admin', 'active'::user_status, 'IT Department'),
  ('John Manager', 'john@botivate.com', 'password123', 9876543211, 'EMP002', 'manager', 'active'::user_status, 'Sales'),
  ('Sarah Director', 'sarah@botivate.com', 'password123', 9876543212, 'EMP003', 'manager', 'active'::user_status, 'Marketing'),
  ('Mike Developer', 'mike@botivate.com', 'password123', 9876543213, 'EMP004', 'user', 'active'::user_status, 'IT Department'),
  ('Emily Sales', 'emily@botivate.com', 'password123', 9876543214', 'EMP005', 'user', 'active'::user_status, 'Sales'),
  ('David Ops', 'david@botivate.com', 'password123', 9876543215, 'EMP006', 'user', 'active'::user_status, 'Operations'),
  ('Jessica HR', 'jessica@botivate.com', 'password123', 9876543216, 'EMP007', 'user', 'on_leave'::user_status, 'Human Resources')
) AS v(user_name, email_id, password, number, employee_id, role, status, user_access)
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email_id = v.email_id OR employee_id = v.employee_id
);
