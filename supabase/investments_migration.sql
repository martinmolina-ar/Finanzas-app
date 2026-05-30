CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('crypto', 'stock', 'etf', 'fund', 'asset', 'other')),
  ticker TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  current_price NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  last_price_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own investments"
  ON investments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_investments_user_id ON investments(user_id);
