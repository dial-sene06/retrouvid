CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE comptes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  prenom text NOT NULL,
  email text NOT NULL UNIQUE,
  telephone text NOT NULL,
  mot_de_passe_hache text NOT NULL,
  role text NOT NULL CHECK (role IN ('citoyen','decouvreur','agent','admin')),
  actif boolean NOT NULL DEFAULT true,
  cree_le timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id uuid NOT NULL REFERENCES comptes(id),
  type_document text NOT NULL CHECK (type_document IN ('cni','permis','passeport')),
  numero text NOT NULL,
  nom_proprietaire text NOT NULL,
  date_naissance date,
  lieu_perte text NOT NULL,
  date_perte date NOT NULL,
  description text,
  etat text NOT NULL DEFAULT 'en_attente' CHECK (etat IN ('en_attente','en_verification','remis','cloture')),
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX declarations_numero_idx ON declarations (type_document, numero);
CREATE INDEX declarations_compte_idx ON declarations (compte_id);

CREATE TABLE signalements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id uuid NOT NULL REFERENCES comptes(id),
  type_document text NOT NULL CHECK (type_document IN ('cni','permis','passeport')),
  numero text NOT NULL,
  nom_sur_document text NOT NULL,
  date_naissance date,
  lieu_trouve text NOT NULL,
  date_trouve date NOT NULL,
  description text,
  etat text NOT NULL DEFAULT 'en_attente' CHECK (etat IN ('en_attente','en_verification','remis','cloture')),
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signalements_numero_idx ON signalements (type_document, numero);
CREATE INDEX signalements_compte_idx ON signalements (compte_id);

CREATE TABLE correspondances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id uuid NOT NULL REFERENCES declarations(id),
  signalement_id uuid NOT NULL REFERENCES signalements(id),
  score integer NOT NULL,
  champs_concordants text[] NOT NULL DEFAULT '{}',
  validation_agent_par uuid REFERENCES comptes(id),
  validation_agent_le timestamptz,
  validation_citoyen_le timestamptz,
  etat text NOT NULL DEFAULT 'en_verification'
    CHECK (etat IN ('en_verification','validee_agent','validee_citoyen','payee','remise','ecartee','cloturee')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (declaration_id, signalement_id)
);

CREATE TABLE paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondance_id uuid NOT NULL UNIQUE REFERENCES correspondances(id),
  compte_id uuid NOT NULL REFERENCES comptes(id),
  montant integer NOT NULL,
  statut text NOT NULL CHECK (statut IN ('simule','reussi','echoue')),
  reference text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE remises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondance_id uuid NOT NULL UNIQUE REFERENCES correspondances(id),
  confirmee_citoyen_le timestamptz,
  confirmee_decouvreur_le timestamptz,
  cloturee_le timestamptz
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_id uuid NOT NULL REFERENCES comptes(id),
  type text NOT NULL,
  message text NOT NULL,
  lue boolean NOT NULL DEFAULT false,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_compte_idx ON notifications (compte_id, cree_le DESC);

CREATE TABLE journal_actions (
  id bigserial PRIMARY KEY,
  compte_id uuid REFERENCES comptes(id),
  action text NOT NULL,
  objet_type text,
  objet_id text,
  detail jsonb,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_action_idx ON journal_actions (action, cree_le DESC);
