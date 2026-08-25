CREATE TABLE IF NOT EXISTS ticket_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL,
  to_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket_id ON ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_token ON ticket_transfers(token);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_to_email ON ticket_transfers(to_email);

ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ticket_transfers"
  ON ticket_transfers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can read transfers for their tickets"
  ON ticket_transfers FOR SELECT
  USING (
    to_email = (
      SELECT email FROM profiles WHERE id = auth.uid()
    )
    OR from_user_id = auth.uid()
  );
