#!/bin/bash
# bootstrap-server.sh
#
# Takes a fresh Ubuntu VM and sets up the full VetMyBuilder stack.
# Run from your laptop: ssh root@<ip> < scripts/bootstrap-server.sh
#
# Prerequisites:
#   - Fresh Ubuntu 20.04+ VM with root SSH access
#   - GCS backup bucket (gs://vetmybuilder-backups) with env files and DB dumps
#   - Deploy SSH public key already in authorized_keys (set during VM creation)
#
# What it does:
#   1. Installs Node.js 20, MySQL 8, Nginx, PM2, Certbot, gcloud CLI
#   2. Opens firewall ports 80/443
#   3. Creates databases (vetmybuilder + vetmybuilder_staging)
#   4. Clones the repo (prod + staging copies)
#   5. Restores env files and DB dumps from latest GCS backup
#   6. Builds both apps
#   7. Configures Nginx reverse proxy
#   8. Starts PM2 processes
#   9. Sets up nightly backup cron
#
# After running, you still need to:
#   - Update DNS A records to point to the new IP
#   - Run certbot for SSL (needs DNS to resolve first)
#   - Update GitHub Actions secrets (PROD_HOST, PROD_SSH_KEY)

set -e

echo "=== VetMyBuilder server bootstrap ==="

# -------------------------------------------------------
# 0. Ensure swap (small VMs need this for npm ci + Next.js build)
# -------------------------------------------------------
if [ ! -f /swapfile ]; then
  echo "[0/9] Creating 2GB swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "[0/9] Swap already exists"
fi

# -------------------------------------------------------
# 1. Install packages
# -------------------------------------------------------
echo "[1/9] Installing packages..."
apt-get update -qq
apt-get install -y -qq curl nginx mysql-server certbot python3-certbot-nginx apt-transport-https ca-certificates gnupg

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

# PM2
npm install -g pm2

# gcloud CLI
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main' > /etc/apt/sources.list.d/google-cloud-sdk.list
apt-get update -qq
apt-get install -y -qq google-cloud-cli

echo "Node $(node -v), npm $(npm -v), PM2 $(pm2 -v)"

# -------------------------------------------------------
# 2. Open firewall ports
# -------------------------------------------------------
echo "[2/9] Configuring firewall..."
# Oracle Ubuntu uses iptables with a REJECT rule - insert before it
REJECT_LINE=$(iptables -L INPUT --line-numbers -n | grep REJECT | head -1 | awk '{print $1}')
if [ -n "$REJECT_LINE" ]; then
  iptables -I INPUT "$REJECT_LINE" -p tcp --dport 80 -j ACCEPT
  iptables -I INPUT "$REJECT_LINE" -p tcp --dport 443 -j ACCEPT
else
  iptables -A INPUT -p tcp --dport 80 -j ACCEPT
  iptables -A INPUT -p tcp --dport 443 -j ACCEPT
fi
netfilter-persistent save 2>/dev/null || true

# -------------------------------------------------------
# 3. Set up MySQL
# -------------------------------------------------------
echo "[3/9] Setting up MySQL..."
# MySQL root password will be restored from the env file backup.
# For now, create databases with the default auth.
mysql -e "CREATE DATABASE IF NOT EXISTS vetmybuilder CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE DATABASE IF NOT EXISTS vetmybuilder_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# -------------------------------------------------------
# 4. Clone repos
# -------------------------------------------------------
echo "[4/9] Cloning repositories..."
mkdir -p /root/apps/vmb
cd /root/apps/vmb

if [ ! -d "vetmybuilder-app" ]; then
  git clone https://github.com/vetmybuilder/vetmybuilder-app.git
fi

if [ ! -d "vetmybuilder-staging" ]; then
  cp -r vetmybuilder-app vetmybuilder-staging
fi

# -------------------------------------------------------
# 5. Restore from GCS backup
# -------------------------------------------------------
echo "[5/9] Restoring from GCS backup..."

# Activate service account if key exists
if [ -f /root/.gcs-backup-key.json ]; then
  gcloud auth activate-service-account --key-file=/root/.gcs-backup-key.json
fi

# Find the latest backup folder
LATEST=$(gsutil ls gs://vetmybuilder-backups/ 2>/dev/null | sort | tail -1)

if [ -n "$LATEST" ]; then
  echo "Restoring from: $LATEST"
  mkdir -p /tmp/vmb-restore
  gsutil -m cp "${LATEST}*" /tmp/vmb-restore/

  # Restore env files
  ENV_PROD=$(ls /tmp/vmb-restore/env_prod_* 2>/dev/null | head -1)
  ENV_WEB_PROD=$(ls /tmp/vmb-restore/env_web_prod_* 2>/dev/null | head -1)
  ENV_STAGING=$(ls /tmp/vmb-restore/env_staging_* 2>/dev/null | head -1)
  ENV_WEB_STAGING=$(ls /tmp/vmb-restore/env_web_staging_* 2>/dev/null | head -1)

  [ -f "$ENV_PROD" ] && cp "$ENV_PROD" /root/apps/vmb/vetmybuilder-app/.env
  [ -f "$ENV_WEB_PROD" ] && cp "$ENV_WEB_PROD" /root/apps/vmb/vetmybuilder-app/web/.env.local
  [ -f "$ENV_STAGING" ] && cp "$ENV_STAGING" /root/apps/vmb/vetmybuilder-staging/.env
  [ -f "$ENV_WEB_STAGING" ] && cp "$ENV_WEB_STAGING" /root/apps/vmb/vetmybuilder-staging/web/.env.local

  # Get MySQL password from restored env
  MYSQL_PWD=$(grep '^MYSQL_PASSWORD=' /root/apps/vmb/vetmybuilder-app/.env | cut -d= -f2)

  # Set MySQL root password
  mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$MYSQL_PWD'; FLUSH PRIVILEGES;"

  # Restore DB dumps
  DB_PROD=$(ls /tmp/vmb-restore/vetmybuilder_2*.sql.gz 2>/dev/null | head -1)
  DB_STAGING=$(ls /tmp/vmb-restore/vetmybuilder_staging_*.sql.gz 2>/dev/null | head -1)

  [ -f "$DB_PROD" ] && gunzip < "$DB_PROD" | mysql -u root -p"$MYSQL_PWD" vetmybuilder
  [ -f "$DB_STAGING" ] && gunzip < "$DB_STAGING" | mysql -u root -p"$MYSQL_PWD" vetmybuilder_staging

  rm -rf /tmp/vmb-restore
  echo "Restore complete"
else
  echo "No GCS backup found - loading schema only"
  MYSQL_PWD="changeme"
  mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$MYSQL_PWD'; FLUSH PRIVILEGES;"
  mysql -u root -p"$MYSQL_PWD" vetmybuilder < /root/apps/vmb/vetmybuilder-app/mysql_schema.sql
  mysql -u root -p"$MYSQL_PWD" vetmybuilder_staging < /root/apps/vmb/vetmybuilder-staging/mysql_schema.sql
  echo "WARNING: No env files restored. You need to create .env and web/.env.local manually."
fi

# -------------------------------------------------------
# 6. Install deps and build
# -------------------------------------------------------
echo "[6/9] Building prod..."
cd /root/apps/vmb/vetmybuilder-app
npm ci
npm run build

echo "Building staging..."
cd /root/apps/vmb/vetmybuilder-staging
npm ci
npm run build

# -------------------------------------------------------
# 7. Configure Nginx
# -------------------------------------------------------
echo "[7/9] Configuring Nginx..."

cat > /etc/nginx/sites-available/vetmybuilder << 'NGINX'
server {
    listen 80;
    server_name vetmybuilder.com www.vetmybuilder.com vetmybuilder.co.uk www.vetmybuilder.co.uk;

    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

cat > /etc/nginx/sites-available/vetmybuilder-staging << 'NGINX'
server {
    listen 80;
    server_name staging.vetmybuilder.com;

    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/vetmybuilder /etc/nginx/sites-enabled/vetmybuilder
ln -sf /etc/nginx/sites-available/vetmybuilder-staging /etc/nginx/sites-enabled/vetmybuilder-staging
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# -------------------------------------------------------
# 8. Start PM2 processes
# -------------------------------------------------------
echo "[8/9] Starting PM2 processes..."

cd /root/apps/vmb/vetmybuilder-app
PORT=8787 pm2 start server/index.js --name vmb-server

cd /root/apps/vmb/vetmybuilder-app/web
pm2 start /root/apps/vmb/vetmybuilder-app/node_modules/.bin/next --name vmb-web -- start -p 3000

cd /root/apps/vmb/vetmybuilder-staging
PORT=8788 pm2 start server/index.js --name vmb-staging-server

cd /root/apps/vmb/vetmybuilder-staging/web
pm2 start /root/apps/vmb/vetmybuilder-staging/node_modules/.bin/next --name vmb-staging-web -- start -p 3001

pm2 save
pm2 startup systemd -u root --hp /root

# -------------------------------------------------------
# 9. Set up backup cron
# -------------------------------------------------------
echo "[9/9] Setting up backups..."

cat > /usr/local/bin/vmb-backup << 'BACKUP'
#!/bin/bash
set -e
BACKUP_DIR=/opt/vmb-backups
MYSQL_PWD=$(grep '^MYSQL_PASSWORD=' /root/apps/vmb/vetmybuilder-app/.env | cut -d= -f2)
DATE=$(date +%Y-%m-%d_%H%M)
RETAIN_DAYS=14
GCS_BUCKET=gs://vetmybuilder-backups
mkdir -p $BACKUP_DIR
mysqldump -u root -p"$MYSQL_PWD" --single-transaction vetmybuilder | gzip > $BACKUP_DIR/vetmybuilder_$DATE.sql.gz
mysqldump -u root -p"$MYSQL_PWD" --single-transaction vetmybuilder_staging | gzip > $BACKUP_DIR/vetmybuilder_staging_$DATE.sql.gz
cp /root/apps/vmb/vetmybuilder-app/.env $BACKUP_DIR/env_prod_$DATE
cp /root/apps/vmb/vetmybuilder-app/web/.env.local $BACKUP_DIR/env_web_prod_$DATE
cp /root/apps/vmb/vetmybuilder-staging/.env $BACKUP_DIR/env_staging_$DATE
cp /root/apps/vmb/vetmybuilder-staging/web/.env.local $BACKUP_DIR/env_web_staging_$DATE
gsutil -m cp $BACKUP_DIR/*$DATE* $GCS_BUCKET/$DATE/
find $BACKUP_DIR -type f -mtime +$RETAIN_DAYS -delete
echo "Backup complete: $DATE (local + GCS)"
BACKUP
chmod +x /usr/local/bin/vmb-backup

cat > /usr/local/bin/vmb-deploy << 'DEPLOY'
#!/bin/bash
set -e
cd /root/apps/vmb/vetmybuilder-app
git pull origin master
npm ci
cd web && npm run build && cd ..
pm2 restart vmb-server --update-env
pm2 restart vmb-web --update-env
pm2 save
echo "Deploy complete at $(date)"
DEPLOY
chmod +x /usr/local/bin/vmb-deploy

cat > /usr/local/bin/vmb-deploy-staging << 'DEPLOY'
#!/bin/bash
set -e
cd /root/apps/vmb/vetmybuilder-staging
git pull origin master
npm ci
cd web && npm run build && cd ..
pm2 restart vmb-staging-server --update-env
pm2 restart vmb-staging-web --update-env
pm2 save
echo "Staging deploy complete at $(date)"
DEPLOY
chmod +x /usr/local/bin/vmb-deploy-staging

mkdir -p /opt/vmb-backups
(crontab -l 2>/dev/null; echo '0 3 * * * /usr/local/bin/vmb-backup >> /var/log/vmb-backup.log 2>&1') | crontab -

echo ""
echo "=== Bootstrap complete ==="
echo ""
echo "Next steps:"
echo "  1. Update DNS A records to point to this server's IP"
echo "  2. Wait for DNS propagation, then run:"
echo "     certbot --nginx -d vetmybuilder.com -d www.vetmybuilder.com -d vetmybuilder.co.uk -d www.vetmybuilder.co.uk --non-interactive --agree-tos -m support@vetmybuilder.com"
echo "     certbot --nginx -d staging.vetmybuilder.com --non-interactive --agree-tos -m support@vetmybuilder.com"
echo "  3. Update GitHub Actions secrets: PROD_HOST=<new-ip>, PROD_SSH_KEY=<base64 key>"
echo "  4. Upload GCS service account key: scp key.json root@<ip>:/root/.gcs-backup-key.json"
echo "  5. Verify: curl https://vetmybuilder.com/health"
