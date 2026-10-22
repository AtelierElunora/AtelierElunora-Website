CREATE SCHEMA IF NOT EXISTS elunora_chat;
CREATE TABLE IF NOT EXISTS elunora_chat.settings (
  shop text PRIMARY KEY, config jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS elunora_chat.usage (
  shop text NOT NULL, month text NOT NULL, requests integer NOT NULL DEFAULT 0, tokens bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(shop, month)
);
CREATE TABLE IF NOT EXISTS elunora_chat.rate (
  key text NOT NULL, bucket bigint NOT NULL, hits integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL,
  PRIMARY KEY(key, bucket)
);
CREATE TABLE IF NOT EXISTS elunora_chat.inquiry (
  id text PRIMARY KEY, shop text NOT NULL, details jsonb NOT NULL, status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_inquiry_shop_created ON elunora_chat.inquiry(shop, created_at DESC);
