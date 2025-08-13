import 'dotenv/config'
import { Client } from 'pg'

const client = new Client()
await client.connect()

await client.query(`
CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  is_admin BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawals(
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount_requested NUMERIC(18,6) NOT NULL,
  fee_percent NUMERIC(5,2) NOT NULL DEFAULT 5,
  amount_net NUMERIC(18,6) NOT NULL,
  wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'solicitado',
  tx_hash TEXT,
  scheduled_for DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO config(key,value) VALUES
  ('minWithdraw', '10') ON CONFLICT (key) DO NOTHING;
INSERT INTO config(key,value) VALUES
  ('feePercent', '5') ON CONFLICT (key) DO NOTHING;
INSERT INTO config(key,value) VALUES
  ('paydayCron', '0 10 * * 1') ON CONFLICT (key) DO NOTHING;
INSERT INTO config(key,value) VALUES
  ('batchMax', '100') ON CONFLICT (key) DO NOTHING;
INSERT INTO config(key,value) VALUES
  ('minTrxForFees', '20') ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_log(
  id SERIAL PRIMARY KEY,
  admin TEXT,
  action TEXT,
  detail TEXT,
  ts TIMESTAMPTZ DEFAULT now()
);
`)

console.log("Migration OK")
await client.end()
