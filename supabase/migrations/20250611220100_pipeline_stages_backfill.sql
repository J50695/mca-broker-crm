-- Route already-processed intakes into the right front-of-pipeline columns
UPDATE deals
SET stage = 'ready_to_submit'
WHERE stage = 'new_intake'
  AND qualification_status = 'qualified'
  AND auto_submit_eligible = true;

UPDATE deals
SET stage = 'needs_stipulations'
WHERE stage = 'new_intake'
  AND qualification_status = 'needs_review';
