-- Instructors and admins (role = 'instructor') can be on any number of audit teams, e.g. for testing.
-- Set from the dashboard: UPDATE roster SET role = 'instructor' WHERE email = '…';
ALTER TABLE roster ADD COLUMN role TEXT;
