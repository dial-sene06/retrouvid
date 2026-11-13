-- Preuve de l'acceptation des conditions d'utilisation (date de la case cochée à l'inscription).
ALTER TABLE comptes ADD COLUMN IF NOT EXISTS cgu_acceptees_le timestamptz;
