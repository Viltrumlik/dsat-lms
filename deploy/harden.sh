#!/bin/bash
# Host hardening and housekeeping. Run once as root; safe to re-run.
# Domain: Deploy
#
#   ./deploy/harden.sh
#
# Everything here is what the application cannot do for itself: the app can
# refuse a request, but it cannot stop the request arriving, and it cannot stop
# the disk filling with the logs of having refused it.
#
# What this deliberately does NOT do is disable SSH password authentication.
# That is the single biggest win available — and the fastest way to lock the
# owner out of their own server if the key on it is not one they hold. It is
# printed as a recommendation at the end instead, with the check to run first.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ─────────────────────────────────────
# fail2ban — ban the repeat offender at the firewall
# ─────────────────────────────────────
# nginx's rate limits answer 429 to every request of a flood, which still costs
# a worker and a log line each time. fail2ban watches for the address doing it
# and drops it at the packet level, so the next thousand requests cost nothing.
say "fail2ban"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq fail2ban >/dev/null

# Docker publishes ports by writing its own iptables rules, which sit in front
# of the INPUT chain fail2ban's default action edits — so a ban on a
# container-published port silently does nothing. The DOCKER-USER chain is the
# one Docker consults first and never rewrites, which is why the nginx jails
# below use an action that targets it.
cat > /etc/fail2ban/action.d/docker-user.conf <<'EOF'
[Definition]
actionstart = iptables -N f2b-docker-<name> 2>/dev/null || true
              iptables -A f2b-docker-<name> -j RETURN 2>/dev/null || true
              iptables -I DOCKER-USER -j f2b-docker-<name> 2>/dev/null || true
actionstop  = iptables -D DOCKER-USER -j f2b-docker-<name> 2>/dev/null || true
              iptables -F f2b-docker-<name> 2>/dev/null || true
              iptables -X f2b-docker-<name> 2>/dev/null || true
actioncheck = iptables -n -L DOCKER-USER | grep -q 'f2b-docker-<name>'
actionban   = iptables -I f2b-docker-<name> 1 -s <ip> -j DROP
actionunban = iptables -D f2b-docker-<name> -s <ip> -j DROP
EOF

# nginx writes plain combined/error logs to a bind-mounted directory (see the
# nginx service in docker-compose.prod.yml), so these are ordinary filters — no
# JSON unwrapping, and no dependence on Docker's storage layout.
cat > /etc/fail2ban/filter.d/dsat-nginx-limit.conf <<'EOF'
[Definition]
# nginx's own words when a limit_req / limit_conn zone rejects a client.
failregex = limiting (requests|connections) by zone .*client: <HOST>,
ignoreregex =
EOF

cat > /etc/fail2ban/filter.d/dsat-nginx-probe.conf <<'EOF'
[Definition]
# 444 is only ever returned by the scanner-path block in deploy/nginx.conf, and
# 401/403 in volume is someone working through credentials or ids.
#
# The `.*` where the timestamp belongs is not laziness: fail2ban finds and
# STRIPS the date before applying this, so a pattern that expects
# `\[[^]]+\]` meets an empty pair of brackets and never matches — a filter
# that loads, runs, reports the jail as enabled and bans nobody.
failregex = ^<HOST> \S+ \S+ .*"(?:GET|POST|HEAD|PUT|DELETE|OPTIONS|PATCH)[^"]*" (?:444|401|403) 
ignoreregex =
EOF

# The bind-mounted path from docker-compose.prod.yml, NOT docker inspect's
# LogPath. That one lives under the container id, so it moves every time nginx
# is recreated and the jail silently goes on watching a file that no longer
# exists — protection that reads as enabled and bans nobody.
NGINX_LOG_DIR=/opt/dsat-lms/logs/nginx
mkdir -p "$NGINX_LOG_DIR"

cat > /etc/fail2ban/jail.d/dsat.conf <<EOF
[DEFAULT]
# A day is long enough to make a scan uneconomic and short enough that a real
# user behind a shared address is not exiled for a week.
bantime  = 24h
findtime = 10m
maxretry = 5
backend  = auto
# Never ban the machine itself, or the health probes take the site out.
ignoreip = 127.0.0.1/8 ::1 172.16.0.0/12

[sshd]
enabled  = true
port     = 22
maxretry = 4
bantime  = 48h

[dsat-nginx-limit]
enabled  = true
filter   = dsat-nginx-limit
logpath  = ${NGINX_LOG_DIR}/error.log
maxretry = 20
findtime = 2m
bantime  = 1h
action   = docker-user[name=limit]

[dsat-nginx-probe]
enabled  = true
filter   = dsat-nginx-probe
logpath  = ${NGINX_LOG_DIR}/access.log
maxretry = 15
findtime = 5m
bantime  = 24h
action   = docker-user[name=probe]
EOF

systemctl enable --now fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 2
fail2ban-client status 2>/dev/null | sed 's/^/  /' || echo "  fail2ban did not start — check journalctl -u fail2ban"

# ─────────────────────────────────────
# Kernel — the cheap network-level defences
# ─────────────────────────────────────
say "sysctl"
cat > /etc/sysctl.d/99-hardening.conf <<'EOF'
# SYN flood: answer the handshake with a cookie instead of holding a half-open
# slot, so a flood of SYNs cannot exhaust the backlog.
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_synack_retries = 2

# Do not accept source-routed packets or ICMP redirects — both let someone else
# choose the path our traffic takes.
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Log packets with impossible source addresses instead of silently dropping.
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.all.rp_filter = 1

# A busy proxy holds a lot of sockets; these are the limits it runs into first.
net.core.somaxconn = 4096
net.ipv4.tcp_fin_timeout = 20
net.ipv4.ip_local_port_range = 10240 65535
EOF
sysctl -q --system >/dev/null 2>&1 || true
echo "  applied"

# ─────────────────────────────────────
# Housekeeping — the things that fill a disk
# ─────────────────────────────────────
say "housekeeping"
# Build cache grows by hundreds of megabytes per deploy and is never read again
# once an image is built. Images no container references are the same story.
cat > /etc/systemd/system/docker-prune.service <<'EOF'
[Unit]
Description=Reclaim Docker build cache and unreferenced images
Documentation=https://github.com/Viltrumlik/dsat-lms

[Service]
Type=oneshot
# Keep a week: enough that a rebuild after a rollback is still fast, short
# enough that the cache cannot grow without bound.
ExecStart=/usr/bin/docker builder prune --force --filter until=168h
ExecStart=/usr/bin/docker image prune --force --filter until=168h
EOF

cat > /etc/systemd/system/docker-prune.timer <<'EOF'
[Unit]
Description=Weekly Docker cleanup

[Timer]
OnCalendar=Sun 04:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# The bind-mounted nginx logs are outside Docker's log driver, so its size cap
# does not apply to them — they need their own rotation or they are the next
# thing to fill the disk. copytruncate because nginx holds the file open and is
# not signalled from here.
cat > /etc/logrotate.d/dsat-nginx <<'EOF'
/opt/dsat-lms/logs/nginx/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
}
EOF

systemctl daemon-reload
systemctl enable --now docker-prune.timer >/dev/null 2>&1
echo "  docker-prune.timer: $(systemctl is-enabled docker-prune.timer)"

# Unattended upgrades are on by default on Ubuntu, but not for every source and
# never with a reboot — so a kernel fix sits installed and unused indefinitely.
cat > /etc/apt/apt.conf.d/51-dsat-unattended <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
// Reboot for kernel updates, at an hour with no students in an exam. Docker
// restarts every container on boot (restart: unless-stopped), so the stack
// comes back without anyone present.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
echo "  unattended-upgrades: $(systemctl is-enabled unattended-upgrades 2>/dev/null || echo unknown)"

say "done"
cat <<'EOF'
  Still worth doing by hand, because getting it wrong locks you out:

    SSH keys only. Password authentication is what every brute-force
    against this box is trying, and fail2ban only slows that down.
    FIRST confirm you can log in from your own machine with a key:

        ssh -o BatchMode=yes root@<this server> true && echo "key works"

    Only if that prints "key works":

        sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
        systemctl reload ssh

    Keep the current terminal open until a NEW one connects successfully.
EOF
