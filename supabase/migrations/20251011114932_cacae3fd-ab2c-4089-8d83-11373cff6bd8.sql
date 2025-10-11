-- Add pause tracking fields to shifts table
ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS is_paused boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS total_paused_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pause_history jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.shifts.is_paused IS 'Whether the shift is currently paused due to being outside radius';
COMMENT ON COLUMN public.shifts.paused_at IS 'When the current pause started';
COMMENT ON COLUMN public.shifts.total_paused_minutes IS 'Total minutes the shift has been paused';
COMMENT ON COLUMN public.shifts.pause_history IS 'Array of pause periods with start/end timestamps';