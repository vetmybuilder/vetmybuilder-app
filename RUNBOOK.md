Vetmybuilder Ops Runbook (quick reference).

App paths:
- Repo: ~/apps/vmb/vetmybuilder-app
- SQLite DB: ~/apps/vmb/vetmybuilder-app/server/data/app.db
- Backups: /opt/vmb-backups/

Processes (PM2):
- List: pm2 ls
- Logs: pm2 logs vmb-server / pm2 logs vmb-web
- Restart: pm2 restart vmb-server --update-env && pm2 restart vmb-web
- Save boot config: pm2 save

Deploy:
- Manual: /usr/local/bin/vmb-deploy
- Nightly cron: 04:10 daily → /var/log/vmb-deploy.log

Secrets (GCP Secret Manager):
- FIREBASE_ADMIN_CREDENTIALS_JSON
- CH_KEY
(Refresh into .env then restart server with --update-env)

Health checks:
- API: https://vetmybuilder.com/api/health
- Status summary: /usr/local/bin/vmb-status

Nginx:
- Test & reload: sudo nginx -t && sudo systemctl reload nginx
- Site config: /etc/nginx/sites-available/vmb

Certs (Let’s Encrypt):
- Renew dry-run: sudo certbot renew --dry-run
- Install (existing): sudo certbot install --nginx --cert-name vetmybuilder.com

Backups:
- On-demand: sudo /usr/local/bin/vmb-sqlite-backup
- Retention: 14 days

Security:
- Firewall: ufw enabled (OpenSSH, Nginx Full)
- Fail2ban: enabled for sshd
- SSH password auth: disabled
