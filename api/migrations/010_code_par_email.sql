-- Le code de vérification peut aussi partir par e-mail (Brevo). « canal » dit où le dernier code a été envoyé,
-- « email » garde l'adresse de destination le temps de la vérification.
ALTER TABLE verifications_telephone ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'sms' CHECK (canal IN ('sms','email'));
ALTER TABLE verifications_telephone ADD COLUMN IF NOT EXISTS email text;
