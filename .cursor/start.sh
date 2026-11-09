#!/usr/bin/env bash
# Per-boot startup: bring PostgreSQL up and wait until it accepts connections.
set -euo pipefail

echo "==> Starting PostgreSQL"
sudo service postgresql start || true

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    echo "==> PostgreSQL is ready"
    exit 0
  fi
  sleep 1
done

echo "!! PostgreSQL did not become ready in time" >&2
exit 1
