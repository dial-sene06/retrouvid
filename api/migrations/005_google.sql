-- Identifiant Google (champ "sub" du jeton) : stable, contrairement à l'e-mail qu'un utilisateur peut changer chez Google.
ALTER TABLE comptes ADD COLUMN google_sub text UNIQUE;
