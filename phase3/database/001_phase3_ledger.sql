CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_intents (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    strategy_id TEXT NOT NULL,
    venue TEXT NOT NULL,
    instrument TEXT NOT NULL,
    side TEXT NOT NULL,
    order_type TEXT NOT NULL,
    quantity NUMERIC(38,18) NOT NULL CHECK (quantity > 0),
    limit_price NUMERIC(38,18),
    max_slippage_bps INTEGER NOT NULL CHECK (max_slippage_bps BETWEEN 0 AND 10000),
    max_fee NUMERIC(38,18),
    client_order_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS risk_approvals (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES order_intents(id),
    approved BOOLEAN NOT NULL,
    reason TEXT NOT NULL,
    approved_quantity NUMERIC(38,18) NOT NULL DEFAULT 0,
    max_notional NUMERIC(38,18),
    max_slippage_bps INTEGER NOT NULL,
    risk_policy_version TEXT NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_requests (
    id UUID PRIMARY KEY,
    approval_id UUID NOT NULL REFERENCES risk_approvals(id),
    intent_id UUID NOT NULL REFERENCES order_intents(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    venue TEXT NOT NULL,
    instrument TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity NUMERIC(38,18) NOT NULL CHECK (quantity > 0),
    idempotency_key TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    authorization_context JSONB NOT NULL DEFAULT '{}',
    UNIQUE(account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS fills (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES execution_requests(id),
    venue TEXT NOT NULL,
    venue_order_id TEXT,
    venue_trade_id TEXT,
    instrument TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity NUMERIC(38,18) NOT NULL CHECK (quantity > 0),
    price NUMERIC(38,18) NOT NULL CHECK (price > 0),
    fee NUMERIC(38,18) NOT NULL DEFAULT 0,
    fee_asset TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    transaction_id TEXT,
    raw_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    subject_id UUID,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    account_id UUID NOT NULL REFERENCES accounts(id),
    idempotency_key TEXT NOT NULL,
    execution_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS kill_switch_state (
    scope TEXT PRIMARY KEY,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fills_execution_id ON fills(execution_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation_id ON audit_events(correlation_id);
