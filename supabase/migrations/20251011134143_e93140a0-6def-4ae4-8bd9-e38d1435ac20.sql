-- Add fields for automatic shift completion and overtime tracking
ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS auto_ended boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_overtime boolean DEFAULT false;

COMMENT ON COLUMN public.shifts.auto_ended IS 'Indicates if the shift was automatically ended by the system at expected_end time';
COMMENT ON COLUMN public.shifts.is_overtime IS 'Indicates if the shift is overtime work (started after expected_end time)';

-- Create index for efficient querying of active shifts that need auto-ending
CREATE INDEX IF NOT EXISTS idx_shifts_active_not_overtime 
ON public.shifts(site_id, started_at) 
WHERE ended_at IS NULL AND is_overtime = false;