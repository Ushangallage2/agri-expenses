#!/usr/bin/env bash
# Per-boot startup: bring MySQL up and wait until it accepts connections.
set -euo pipefail

echo "==> Starting MySQL"
sudo service mysql start || true

for _ in $(seq 1 30); do
  if sudo mysqladmin ping >/dev/null 2>&1; then
    echo "==> MySQL is ready"
    exit 0
  fi
  sleep 1
done

echo "!! MySQL did not become ready in time" >&2
exit 1
