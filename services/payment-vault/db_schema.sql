-- Database Schema for Payment Vault Service

CREATE SCHEMA IF NOT EXISTS payments;

-- Vault table to store encrypted tokens and metadata securely
CREATE TABLE IF NOT EXISTS payments.vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    encrypted_token BYTEA NOT NULL,
    key_version VARCHAR(50) NOT NULL,
    exp_month INT NOT NULL,
    exp_year INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_vault_user_id ON payments.vault(user_id);
