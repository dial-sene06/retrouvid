#!/usr/bin/env bash
# Sauvegarde de la base RetrouvID : un fichier compressé daté, les 14 plus récents sont gardés.
# Usage : DATABASE_URL=postgres://... ./scripts/sauvegarde.sh [dossier]
set -euo pipefail
: "${DATABASE_URL:?Définissez DATABASE_URL}"
DOSSIER="${1:-./sauvegardes}"
mkdir -p "$DOSSIER"
FICHIER="$DOSSIER/retrouvid-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --clean --if-exists "$DATABASE_URL" | gzip > "$FICHIER"
ls -1t "$DOSSIER"/retrouvid-*.sql.gz | tail -n +15 | xargs -r rm --
echo "Sauvegarde écrite : $FICHIER"
