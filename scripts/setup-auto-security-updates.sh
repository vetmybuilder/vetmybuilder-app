#!/bin/bash
# setup-auto-security-updates.sh
#
# Configures unattended-upgrades on the prod/staging VM so security patches
# (including Ubuntu Pro / ESM) are applied automatically every night, with an
# auto-reboot for kernel updates.
#
# Run on the VM as root:  bash scripts/setup-auto-security-updates.sh
# Idempotent - safe to re-run.
#
# Sequencing (assumes the 3am vmb-backup cron already exists):
#   03:00  vmb-backup (existing nightly dump)
#   03:30  unattended-upgrades applies security-only updates (incl. ESM)
#   04:00  reboot, but ONLY if a kernel/library update requires it
#
# After reboot, PM2 resurrects the apps (pm2-root.service is enabled + pm2 save).
#
# Prerequisite: machine attached to Ubuntu Pro (`pro status`) so ESM security
# origins are present - 20.04 is EOL and gets no security fixes without it.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Must run as root" >&2
  exit 1
fi

echo "=== VMB auto security updates setup ==="

# 1. Ensure the tool is installed
apt-get update -qq
apt-get install -y -qq unattended-upgrades

# 2. Enable the periodic jobs (update lists + run unattended-upgrade daily)
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# 3. VMB overrides: security-only (the default), tidy up, reboot at 04:00 if needed.
#    The default /etc/apt/apt.conf.d/50unattended-upgrades already allows the
#    -security and ESM (-apps-security / -infra-security) origins; we only tune
#    behaviour here so package upgrades survive a distro template change.
cat > /etc/apt/apt.conf.d/52vmb-unattended-upgrades <<'EOF'
// Managed by scripts/setup-auto-security-updates.sh - do not hand-edit.
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF

# 4. Move the run from the ~6am default to 03:30 so it lands after the 3am
#    backup and before the 04:00 reboot window.
mkdir -p /etc/systemd/system/apt-daily-upgrade.timer.d
cat > /etc/systemd/system/apt-daily-upgrade.timer.d/override.conf <<'EOF'
[Timer]
OnCalendar=
OnCalendar=*-*-* 03:30
RandomizedDelaySec=15m
EOF

systemctl daemon-reload
systemctl enable --now unattended-upgrades.service >/dev/null 2>&1 || true
systemctl restart apt-daily-upgrade.timer

echo
echo "Done. Verify with:"
echo "  systemctl list-timers apt-daily-upgrade.timer --no-pager"
echo "  unattended-upgrade --dry-run --debug 2>&1 | tail -20   # what it WOULD do now"
echo "  cat /var/log/unattended-upgrades/unattended-upgrades.log"
