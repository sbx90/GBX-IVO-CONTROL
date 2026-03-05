CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'zinc',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage notes" ON notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
