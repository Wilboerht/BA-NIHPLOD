#!/usr/bin/env bash
# ============================================================================
# BA 文件备份：public/uploads + private（证书 PDF/证据/签名/TSA）
# ============================================================================
# 建议部署到服务器后：
#   chmod 700 /usr/local/bin/backup-ba-uploads.sh
#   crontab: 50 3 * * * /usr/local/bin/backup-ba-uploads.sh >> /var/log/ba-uploads-backup.log 2>&1
#
# 可选环境变量：
#   BA_APP_DIR=/var/www/BA-NIHPLOD
#   BA_UPLOAD_BACKUP_DIR=/var/backups/ba
#   BA_UPLOAD_BACKUP_RETENTION_DAYS=30
# ============================================================================
set -euo pipefail
umask 077

ENV_FILE="${BA_ENV_FILE:-/var/www/BA-NIHPLOD/.env.local}"

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

APP_DIR="${BA_APP_DIR:-$(read_env_value BA_APP_DIR)}"
APP_DIR="${APP_DIR:-/var/www/BA-NIHPLOD}"
DEST="${BA_UPLOAD_BACKUP_DIR:-$(read_env_value BA_UPLOAD_BACKUP_DIR)}"
DEST="${DEST:-/var/backups/ba}"
RETENTION_DAYS="${BA_UPLOAD_BACKUP_RETENTION_DAYS:-$(read_env_value BA_UPLOAD_BACKUP_RETENTION_DAYS)}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
OFFSITE_TARGET="${BA_OFFSITE_TARGET:-$(read_env_value BA_OFFSITE_TARGET)}"

mkdir -p "$DEST"
chmod 700 "$DEST"

TS="$(date +%Y%m%d_%H%M%S)"
FILE="$DEST/ba-files_${TS}.tar.gz"

INCLUDES=()
[[ -d "$APP_DIR/public/uploads" ]] && INCLUDES+=("public/uploads")
[[ -d "$APP_DIR/private" ]] && INCLUDES+=("private")

if [[ ${#INCLUDES[@]} -eq 0 ]]; then
  echo "[backup-ba-uploads] no public/uploads or private directory found under $APP_DIR" >&2
  exit 1
fi

echo "[backup-ba-uploads] archiving ${INCLUDES[*]} -> $FILE"
tar -czf "$FILE" -C "$APP_DIR" "${INCLUDES[@]}"

sha256sum "$FILE" > "$FILE.sha256"
chmod 600 "$FILE" "$FILE.sha256"

if [[ -n "$OFFSITE_TARGET" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    echo "[backup-ba-uploads] offsite -> $OFFSITE_TARGET"
    rsync -a "$FILE" "$FILE.sha256" "${OFFSITE_TARGET%/}/"
  else
    echo "WARN: rsync not found; offsite copy skipped" >&2
  fi
fi

find "$DEST" -maxdepth 1 -type f -name 'ba-files_*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
find "$DEST" -maxdepth 1 -type f -name 'ba-files_*.tar.gz.sha256' -mtime +"$RETENTION_DAYS" -delete

echo "[backup-ba-uploads] done: $FILE"
echo "[backup-ba-uploads] size: $(du -h "$FILE" | cut -f1)"
echo "[backup-ba-uploads] IMPORTANT: copy this file off-server (rsync/scp/NAS)"
