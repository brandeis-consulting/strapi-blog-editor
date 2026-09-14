#!/usr/bin/env bash
#
# Stack in Portainer neu ausrollen (Stack-Webhook).
#
# Wortgleiche Kopie aus brandeis-platform/.github/scripts/portainer-deploy.sh.
# Das Skript ist generisch (Stack, Secret-Name und URL kommen als Argumente); die
# darin festgehaltenen Fallstricke — allen voran das fehlende /portainer im Pfad —
# gelten fuer diesen Stack genauso. Aendert sich dort etwas, hier nachziehen.
#
# Aufruf: portainer-deploy.sh <stack> <secret-name> <webhook-url>
#
# Warum ein eigenes Skript und kein `curl -fsS` in der Workflow-Zeile: Der nackte
# curl-Aufruf bricht bei einem unbekannten Webhook mit
#
#     curl: (22) The requested URL returned error: 404
#     Error: Process completed with exit code 22
#
# ab — und lässt jeden ratlos zurück, der das Docker-System nicht selbst aufgesetzt hat.
# Weder steht da, welcher Dienst 404 sagt, noch was das fürs Image heißt, noch wo man
# das repariert. Genau das steht jetzt in der Meldung.
#
# Der Webhook selbst ist eine Portainer-Adresse der Form
# `https://<portainer>/api/stacks/webhooks/<uuid>`; ein POST darauf zieht das Image neu und
# setzt den Stack auf. Die Zugangsdaten für das **private** ghcr-Paket hat nur Portainer —
# deshalb dieser Umweg und nicht `pull_policy: always` im Compose (am 14.08.2026 probiert
# und zurückgenommen, siehe CLAUDE.md).
#
# **Das Pfad-Präfix ist die Falle** (kostete vom 19.08. bis 31.08.2026 lauter rote Läufe):
# Portainer läuft hinter Caddy unter `files.brandeis.de/portainer/…` und weiß nichts davon.
# Die in seiner Oberfläche angezeigte Webhook-URL entsteht aus der Browser-Adresse und
# lautet deshalb `https://files.brandeis.de/api/stacks/webhooks/<uuid>` — ohne
# `/portainer`. So kopiert landet der Aufruf beim Catch-all der Domain (zipline), der
# **ebenfalls** 404 sagt; unterscheidbar nur am Text (`Route POST:… not found` gegen
# Portainers `Unable to find the stack by webhook ID`). Richtig ist:
#
#     https://files.brandeis.de/portainer/api/stacks/webhooks/<uuid>
set -euo pipefail

stack="${1:?Stack-Name fehlt}"
secret_name="${2:?Secret-Name fehlt}"
hook="${3:-}"

if [ -z "$hook" ]; then
  # **Sichtbar, nicht bloß protokolliert.** Vorher stand hier nur ein `echo`: Der Schritt war
  # grün, der Lauf war grün, das Image lag in ghcr — und der Stack blieb alt. Ein solches
  # „alles in Ordnung" kostet am 04.09.2026 anderthalb Stunden Suche an der falschen Stelle
  # (Portainer zeigt in diesem Fall nichts, weil nie ein Aufruf ankommt). Deshalb eine
  # Annotation, die GitHub oben am Lauf anzeigt, plus eine Zeile in der Zusammenfassung.
  #
  # Kein `exit 1`: Ein Stack ohne Webhook ist eine legitime Betriebsentscheidung, und ein
  # dauerhaft roter Lauf wird nach der dritten Woche nicht mehr gelesen (siehe der Webhook-404
  # vom August). Der Lauf soll nicht scheitern, sondern es sagen.
  echo "::warning title=Stack ${stack} nicht ausgerollt::${secret_name} ist nicht gesetzt. Das Image liegt in ghcr — in Portainer über „Update the stack\" MIT „Re-pull image\" aktualisieren."
  echo "Hinweis: ${secret_name} ist nicht gesetzt — der Stack „${stack}\" wird nicht automatisch ausgerollt."
  echo "Das Image liegt in ghcr; ausrollen in Portainer über „Update the stack\" MIT „Re-pull image\"."
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### ⚠️ Stack \`${stack}\` **nicht** ausgerollt"
      echo
      echo "Das Secret \`${secret_name}\` ist nicht gesetzt. Das Image liegt in ghcr; der Stack läuft"
      echo "noch auf dem alten Stand. In Portainer über „Update the stack\" **mit** „Re-pull image\""
      echo "aktualisieren — oder die Webhook-URL als Secret hinterlegen (mit \`/portainer\` im Pfad!)."
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

# Kein `-f`: Wir wollen den Status selbst lesen, um ihn erklären zu können. curl gibt bei
# einem Verbindungsfehler selbst „000" aus — ein zusätzliches `|| echo 000` hängte daran
# eine zweite Null-Gruppe und machte aus dem Status „000000".
code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST --max-time 60 "$hook" || true)"
[ -z "$code" ] && code=000

case "$code" in
  2*)
    echo "Stack „${stack}\" ausgerollt (HTTP ${code})."
    ;;
  404)
    cat >&2 <<EOF
Portainer kennt diesen Webhook nicht (HTTP 404).

  Das Image ist gebaut und liegt in ghcr — es fehlt NUR das Ausrollen.

  Sofort weiterkommen:
    Portainer → Stacks → ${stack} → „Update the stack" und dabei
    „Re-pull image" ankreuzen (ohne das Häkchen kommt der alte Stand wieder hoch).

  Dauerhaft reparieren:
    Portainer → Stacks → ${stack} → Webhook-URL kopieren, dann in GitHub unter
    Settings → Secrets and variables → Actions das Secret ${secret_name} ersetzen.
    Ein in Portainer neu angelegter Stack bekommt eine neue Webhook-Id — die alte
    antwortet danach mit genau diesem 404.

  ACHTUNG, das Pfad-Präfix fehlt in der kopierten URL:
    Portainer läuft hinter Caddy unter /portainer und weiß nichts davon; die angezeigte
    URL entsteht aus der Browser-Adresse. Richtig ist
      https://files.brandeis.de/portainer/api/stacks/webhooks/<uuid>
    Ohne /portainer antwortet der Catch-all der Domain — auch mit 404.
EOF
    exit 1
    ;;
  000)
    echo "Portainer war nicht erreichbar (Zeitüberschreitung/DNS). Image ist gebaut; Stack „${stack}\" bitte von Hand aktualisieren („Re-pull image\")." >&2
    exit 1
    ;;
  *)
    echo "Portainer antwortete mit HTTP ${code}. Image ist gebaut; Stack „${stack}\" bitte von Hand aktualisieren („Re-pull image\")." >&2
    exit 1
    ;;
esac
