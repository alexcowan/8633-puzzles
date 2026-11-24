-- The class team each student signed up for (set by the instructor from the audit results page).
-- Lets the results page list every team, including ones that haven't started the audit.
ALTER TABLE roster ADD COLUMN team TEXT;
