-- Une même personne peut déclarer une perte et signaler un document trouvé :
-- le rôle « decouvreur » disparaît, ses comptes deviennent des comptes « citoyen ».
ALTER TABLE comptes DROP CONSTRAINT IF EXISTS comptes_role_check;
UPDATE comptes SET role = 'citoyen' WHERE role = 'decouvreur';
ALTER TABLE comptes ADD CONSTRAINT comptes_role_check CHECK (role IN ('citoyen','agent','admin'));
