VetMyBuilder Ops Runbook (quick reference)

Server:
- Provider: Oracle Cloud (Always Free tier, ARM Ampere A1.Flex)
- IP: 140.238.73.63
- SSH: ssh vmb (alias in ~/.ssh/config, key ~/.ssh/id_ed25519_vmb)
- OS: Ubuntu 20.04, Node.js 20, MySQL 8, Nginx, PM2

App paths:
- Prod repo: ~/apps/vmb/vetmybuilder-app
- Staging repo: ~/apps/vmb/vetmybuilder-staging
- Prod env: ~/apps/vmb/vetmybuilder-app/.env + web/.env.local
- Staging env: ~/apps/vmb/vetmybuilder-staging/.env + web/.env.local
- Backups: /opt/vmb-backups/

Databases:
- Prod: vetmybuilder (MySQL, localhost:3306)
- Staging: vetmybuilder_staging (MySQL, localhost:3306)

Processes (PM2):
- pm2 ls (list all)
- Prod: vmb-server (port 8787), vmb-web (port 3000)
- Staging: vmb-staging-server (port 8788), vmb-staging-web (port 3001)
- Logs: pm2 logs vmb-server / pm2 logs vmb-web
- Restart prod: pm2 restart vmb-server --update-env && pm2 restart vmb-web
- Restart staging: pm2 restart vmb-staging-server --update-env && pm2 restart vmb-staging-web
- Save boot config: pm2 save

Deploy:
- CI: pushes to master trigger GitHub Actions (staging first, then prod)
- Manual prod: ssh vmb then vmb-deploy
- Manual staging: ssh vmb then vmb-deploy-staging
- Manual trigger: GitHub Actions > Deploy workflow > Run workflow

DNS (GoDaddy):
- vetmybuilder.com (A @ -> 140.238.73.63)
- www.vetmybuilder.com (A www -> 140.238.73.63)
- staging.vetmybuilder.com (A staging -> 140.238.73.63)
- vetmybuilder.co.uk (A @ -> 140.238.73.63)
- www.vetmybuilder.co.uk (A www -> 140.238.73.63)

GitHub Actions secrets:
- PROD_HOST: 140.238.73.63
- PROD_SSH_KEY: base64-encoded deploy key (decode with base64 -d in workflow)

Nginx:
- Test and reload: nginx -t && systemctl reload nginx
- Prod config: /etc/nginx/sites-available/vetmybuilder
- Staging config: /etc/nginx/sites-available/vetmybuilder-staging

Certs (Let's Encrypt):
- Renew dry-run: certbot renew --dry-run
- Prod covers: vetmybuilder.com, www, .co.uk, www.co.uk
- Staging covers: staging.vetmybuilder.com
- Auto-renewal via certbot systemd timer

Health checks:
- Prod API: curl https://vetmybuilder.com/health
- Staging API: curl https://staging.vetmybuilder.com/health

Backups:
- Script: /usr/local/bin/vmb-backup
- Schedule: nightly at 3am (crontab)
- Log: /var/log/vmb-backup.log
- Location: /opt/vmb-backups/
- Contents: both DB dumps (gzipped) + all 4 env files
- Retention: 14 days auto-pruned
- Manual run: ssh vmb then vmb-backup
- Restore prod DB: gunzip < vetmybuilder_YYYY-MM-DD_HHMM.sql.gz | mysql -u root -p vetmybuilder
- Restore staging DB: gunzip < vetmybuilder_staging_YYYY-MM-DD_HHMM.sql.gz | mysql -u root -p vetmybuilder_staging
- Restore env: cp env_prod_YYYY-MM-DD_HHMM ~/apps/vmb/vetmybuilder-app/.env

Security:
- Firewall: iptables (ports 22, 80, 443 open, rest rejected)
- SSH: key-only auth (id_ed25519_vmb)
- Oracle Cloud: security list ingress rules for TCP 22, 80, 443
