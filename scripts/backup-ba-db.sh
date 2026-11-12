#!/usr/bin/env bash
# ============================================================================
# BA 数据库备份
# ============================================================================
# 建议部署到服务器后：
#   chmod 700 /usr/local/bin/backup-ba-db.sh
#   crontab: 40 3 * * * /usr/local/bin/backup-ba-db.sh >> /var/log/ba-db-backup.log 2>&1
#
# 可选环境变量：
#   BA_ENV_FILE=/var/www/BA-NIHPLOD/.env.local
#   BA_DB_BACKUP_DIR=/root/db-backups
#   BA_DB_BACKUP_RETENTION_DAYS=30
# ============================================================================
set -euo pipefail
umask 077

ENV_FILE="${BA_ENV_FILE:-/var/www/BA-NIHPLOD/.env.local}"
DEST="${BA_DB_BACKUP_DIR:-/root/db-backups}"
RETENTION_DAYS="${BA_DB_BACKUP_RETENTION_DAYS:-30}"
OFFSITE_TARGET="${BA_OFFSITE_TARGET:-}"

# 只解析白名单键，绝不 source .env.local（避免配置文件中的命令被执行）
read_env_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  local value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(read_env_value DATABASE_URL)"
fi
if [[ -z "$OFFSITE_TARGET" ]]; then
  OFFSITE_TARGET="$(read_env_value BA_OFFSITE_TARGET)"
fi

DATABASE_URL="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL" ]]; then
  echo "ERROR: DATABASE_URL is not set (checked $ENV_FILE)" >&2
  exit 1
fi

# pg_dump/libpq 不接受 app 连接串里的 ?schema=public，但需要保留 sslmode 等参数
DATABASE_URL="$(
  DATABASE_URL="$DATABASE_URL" node -e '
    const raw = process.env.DATABASE_URL || "";
    try {
      const url = new URL(raw);
      url.searchParams.delete("schema");
      process.stdout.write(url.toString());
    } catch {
      process.stdout.write(raw);
    }
  '
)"

mkdir -p "$DEST"
chmod 700 "$DEST"

TS="$(date +%Y%m%d_%H%M%S)"
FILE="$DEST/ba_nihplod_db_${TS}.dump"

echo "[backup-ba-db] dumping ba_nihplod_db -> $FILE"
pg_dump -Fc --no-owner --no-privileges -d "$DATABASE_URL" -f "$FILE"

sha256sum "$FILE" > "$FILE.sha256"
chmod 600 "$FILE" "$FILE.sha256"

if [[ -n "$OFFSITE_TARGET" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    echo "[backup-ba-db] offsite -> $OFFSITE_TARGET"
    rsync -a "$FILE" "$FILE.sha256" "${OFFSITE_TARGET%/}/"
  else
    echo "WARN: rsync not found; offsite copy skipped" >&2
  fi
fi

find "$DEST" -maxdepth 1 -type f -name 'ba_nihplod_db_*.dump' -mtime +"$RETENTION_DAYS" -delete
find "$DEST" -maxdepth 1 -type f -name 'ba_nihplod_db_*.dump.sha256' -mtime +"$RETENTION_DAYS" -delete

echo "[backup-ba-db] done: $FILE"
echo "[backup-ba-db] size: $(du -h "$FILE" | cut -f1)"
echo "[backup-ba-db] IMPORTANT: copy this file off-server (rsync/scp/NAS)"
