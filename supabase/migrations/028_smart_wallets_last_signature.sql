-- Fase 1: cursor para delta fetching (Fase 4). Opcional hasta que el código escriba el campo.
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS last_signature TEXT;

COMMENT ON COLUMN smart_wallets.last_signature IS 'Última firma de tx procesada por wallet (delta fetch / Sentinel Edge)';
