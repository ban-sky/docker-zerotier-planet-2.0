## Introduction

Self-hosted **ZeroTier planet** and **ztncui network controller** in Docker, from the
[docker-zerotier-planet 2.0](https://github.com/ban-sky/zerotier-planet-2.0) project.
Ships ZeroTier One 1.16.2 with TLS and the hardened defaults enabled.

## Features

- Generates the planet and moon files, so clients can join your private networks with a custom planet.
- Random admin password on first start, forced password change at first sign-in, password file deleted afterwards.
- HTTPS by default for both the admin UI and the file server (self-signed ECDSA P-256 certificate).
- The admin UI ships in Simplified Chinese and English (Chinese by default, switchable in the header).
- The icon and UI use the official ZeroTier brand mark (amber `#FFB25B` on navy `#161C24`).
- The planet download requires an `Authorization: Bearer` key instead of a key in the URL.
- Data persists in the app directory under `data/` (`config`, `dist`, `one`).
- **Two-step verification (TOTP)** per admin, with single-use backup codes.
- **Passkeys (WebAuthn)** as the alternative second factor; needs a hostname and a trusted certificate.

## Install

1. Fill in the public IPv4 address (required), optionally IPv6, and the three ports.
2. After installing, open `https://<server-ip>:<admin-port>`.
3. First login: sign in as `admin` with the password from the "Initial password"
   section below, then set a new password straight away.

## Initial password

The password is generated randomly on the container's first start. It is **not written to
the logs** and never shown in the UI. Pick whichever way is convenient:

- In the 1Panel app **Terminal**: `cat /app/config/admin-password`
- On the host: `sudo find /opt/1panel/apps -maxdepth 6 -name admin-password -exec cat {} \;`
- Through docker: `docker exec <container> cat /app/config/admin-password`

The first sign-in forces a password change; the file is deleted once that is done. If the
password is lost later, delete `data/config/ztncui-passwd` next to `data/config/admin-password`
and restart the container to generate a fresh one (this replaces the existing admin password).

> The default image is `docker.io/lonelyx/zerotier-planet:<version>` (no leading `v`); the
> same image is also published as `ghcr.io/ban-sky/zerotier-planet:<version>`.

## Automatic updates (cron job)

One line syncs the newest release into the local store — **paste and run it**, or put it
in a **Cron job → Shell script** entry:

```bash
curl -fsSL https://raw.githubusercontent.com/ban-sky/zerotier-planet-2.0/main/scripts/1panel-scheduled-update.sh | sudo bash -s -- --quiet
```

Like [okxlin/appstore](https://github.com/okxlin/appstore), it syncs the package into
`/opt/1panel/resource/apps/local/` so the panel lists the new version. To run it by hand:

```bash
# the script is also attached to every Release
sudo ./1panel-scheduled-update.sh --dry-run                # preview
sudo ./1panel-scheduled-update.sh --quiet                  # pick the fastest channel
sudo ./1panel-scheduled-update.sh --source cdn --quiet     # jsDelivr only (China)
sudo ./1panel-scheduled-update.sh --source branch --quiet  # follow the main branch
sudo ./1panel-scheduled-update.sh \
  --mirror https://ghfast.top/ --quiet                     # behind a GitHub mirror
sudo ./1panel-scheduled-update.sh \
  --source dir --from-dir /root/zerotier-planet-2.0 --quiet # fully offline
```

It refreshes this app package and restarts the installed instance;
`--no-restart` updates the package only. On networks where GitHub is blocked every
request gives up after 8 s and the next channel (jsDelivr or a mirror) is tried, so it
never hangs retrying. See the
[project README](https://github.com/ban-sky/zerotier-planet-2.0#cron-job-follow-new-releases-automatically)
for every flag.

## Ports

| Port | Protocol | Purpose |
| --- | --- | --- |
| 9994 | UDP | ZeroTier service port, must be allowed through the firewall |
| 3443 | TCP | Admin UI (HTTPS) |
| 3000 | TCP | planet/moon download (HTTPS, key required) |
