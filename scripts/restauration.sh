#!/usr/bin/env bash
# Restaure une sauvegarde dans la base désignée par DATABASE_URL (le contenu actuel est remplacé).
# Usage : DATABASE_URL=postgres://... ./scripts/restauration.sh sauvegardes/retrouvid-AAAAMMJJ-HHMMSS.sql.gz
set -euo pipefail
: "${DATABASE_URL:?Définissez DATABASE_URL}"
FICHIER="${1:?Indiquez le fichier de sauvegarde}"
gunzip -c "$FICHIER" | psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" > /dev/null
echo "Restauration terminée depuis $FICHIER"
