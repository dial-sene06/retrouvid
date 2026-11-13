-- Index sur les clés étrangères utilisées par les jointures et les filtres
CREATE INDEX IF NOT EXISTS correspondances_signalement_idx ON correspondances (signalement_id);
CREATE INDEX IF NOT EXISTS correspondances_etat_idx ON correspondances (etat, cree_le);
CREATE INDEX IF NOT EXISTS paiements_compte_idx ON paiements (compte_id);
CREATE INDEX IF NOT EXISTS journal_compte_idx ON journal_actions (compte_id, cree_le DESC);
-- Un montant ne peut pas être négatif
ALTER TABLE paiements ADD CONSTRAINT paiements_montant_positif CHECK (montant >= 0);
