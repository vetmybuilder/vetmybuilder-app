-- 004_split_windows_doors.sql
-- Splits the 'Windows & Doors' pilot category into two: 'Windows' and 'Doors'.
-- Existing per-leaf enabled state is preserved - only the `category` column
-- moves. Also re-homes 'Internal Door Hanging' (previously dual-listed under
-- Carpentry & Joinery) so it joins the Doors set.

UPDATE pilot_project_types
   SET category = 'Doors'
 WHERE type_name IN (
   'Bi-fold Door Installation',
   'Door Frame Repair',
   'Front Door Replacement',
   'Garage Door Replacement',
   'Internal Door Hanging',
   'Patio/French Door Installation'
 );

UPDATE pilot_project_types
   SET category = 'Windows'
 WHERE type_name IN (
   'Sash Window Repair/Replacement',
   'Secondary Glazing',
   'Triple Glazing Upgrade',
   'Window Repair',
   'Window Replacement (uPVC)',
   'Window Replacement (Aluminium)',
   'Window Replacement (Timber)'
 );
