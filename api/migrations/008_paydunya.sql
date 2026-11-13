-- Paiement réel par PayDunya (Wave, Orange Money) à la place du paiement simulé.
-- Une ligne par correspondance : elle naît « en_attente » quand la facture est créée,
-- passe à « reussi » seulement après confirmation de PayDunya, côté serveur.
ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_statut_check;
ALTER TABLE paiements ADD CONSTRAINT paiements_statut_check
  CHECK (statut IN ('simule','en_attente','reussi','echoue','annule'));

ALTER TABLE paiements
  ADD COLUMN IF NOT EXISTS fournisseur text NOT NULL DEFAULT 'paydunya',
  ADD COLUMN IF NOT EXISTS jeton text,
  ADD COLUMN IF NOT EXISTS url_paiement text,
  ADD COLUMN IF NOT EXISTS maj_le timestamptz NOT NULL DEFAULT now();

-- les lignes antérieures (démonstration) restent identifiées comme simulées
UPDATE paiements SET fournisseur = 'simulation' WHERE statut = 'simule';

CREATE UNIQUE INDEX IF NOT EXISTS paiements_jeton_uniq ON paiements (jeton) WHERE jeton IS NOT NULL;
