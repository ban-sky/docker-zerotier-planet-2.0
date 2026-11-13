## Introduction

Self-hosted **ZeroTier planet** and **ztncui network controller** in Docker, from the
[docker-zerotier-planet 2.0](https://github.com/ban-sky/docker-zerotier-planet-2.0) project.
Ships ZeroTier One 1.16.2 with TLS and the hardened defaults enabled.

## Features

- Generates the planet and moon files, so clients can join your private networks with a custom planet.
- Random admin password on first start, forced password change at first sign-in, password file deleted afterwards.
- HTTPS by default for both the admin UI and the file server (self-signed ECDSA P-256 certificate).
- The admin UI ships in Simplified Chinese and English (Chinese by default, switchable in the header).
- The planet download requires an `Authorization: Bearer` key instead of a key in the URL.
- Data persists in the app directory under `data/` (`config`, `dist`, `one`).

## Install

1. Fill in the public IPv4 address (required), optionally IPv6, and the three ports.
2. After installing, open `https://<server-ip>:<admin-port>`.
3. First login: open the app **Terminal** and run `cat /app/config/admin-password`,
   sign in as `admin` and change the password immediately.

## Automatic updates (cron job)

Schedule `scripts/1panel-scheduled-update.sh` from the repository as a 1Panel
**Cron job → Shell script** entry. Like [okxlin/appstore](https://github.com/okxlin/appstore),
it syncs the package into `/opt/1panel/resource/apps/local/` so the panel lists the
new version:

```bash
# the script is also attached to every Release
sudo ./1panel-scheduled-update.sh --dry-run               # preview
sudo ./1panel-scheduled-update.sh --quiet                 # follow the newest Release
sudo ./1panel-scheduled-update.sh --source branch --quiet # follow the main branch
sudo ./1panel-scheduled-update.sh --source branch \
  --mirror https://ghproxy.net/ --quiet                   # behind a GitHub mirror
```

It refreshes this app package and restarts the installed instance;
`--no-restart` updates the package only. See the
[project README](https://github.com/ban-sky/docker-zerotier-planet-2.0#cron-job-follow-new-releases-automatically)
for every flag.

## Ports

| Port | Protocol | Purpose |
| --- | --- | --- |
| 9994 | UDP | ZeroTier service port, must be allowed through the firewall |
| 3443 | TCP | Admin UI (HTTPS) |
| 3000 | TCP | planet/moon download (HTTPS, key required) |
