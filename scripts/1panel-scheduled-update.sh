#!/usr/bin/env bash
#
# Keep the 1Panel app store package (and the running app) on the latest release.
#
# Designed to be the command of a 1Panel "Cron job" (计划任务) entry:
#
#   /opt/docker-zerotier-planet-2.0/scripts/1panel-scheduled-update.sh --quiet
#
# What it does, in order:
#   1. resolves the newest release tag (GitHub API, or --tag to pin one);
#   2. compares it with the versions already present in the local app store;
#   3. downloads 1panel-app-<tag>.tar.gz + SHA256SUMS and verifies the checksum;
#   4. swaps the package into /opt/1panel/resource/apps/local/zerotier-planet
#      (backup kept next to it, never deleted);
#   5. unless --no-restart: re-points the installed app's compose file at the new
#      image tag and runs `docker compose pull && up -d`, rolling back on failure.
#
# Exit codes: 0 = success / already current, 1 = error, 2 = usage error.
#
set -Eeuo pipefail

APP_KEY=zerotier-planet
REPO="ban-sky/docker-zerotier-planet-2.0"
DEFAULT_PANEL_DIR=/opt/1panel

panel_dir="${PANEL_DIR:-$DEFAULT_PANEL_DIR}"
tag=""
dry_run=0
quiet=0
restart=1
keep_downloads=0

log() { [ "$quiet" -eq 1 ] || printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
warn() { printf '%s WARN %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
die() { printf '%s ERROR %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: 1panel-scheduled-update.sh [options]

Update the local 1Panel app store package of ZeroTier Planet (and optionally the
running container) to the latest GitHub release.

Options:
  --tag <vX.Y.Z>     Install this tag instead of the latest release.
  --panel-dir <dir>  1Panel installation directory (default: /opt/1panel,
                     or $PANEL_DIR).
  --no-restart       Only refresh the app store package; do not touch the
                     running container.
  --keep-downloads   Leave the downloaded archive in the temp directory.
  --dry-run          Print what would happen, change nothing.
  --quiet            Only log warnings and errors (cron friendly).
  -h, --help         Show this help.

Typical 1Panel cron job:
  1. Panel -> Cron job -> Create -> Type: Shell script / Execute script
  2. Command: /path/to/scripts/1panel-scheduled-update.sh --quiet
  3. Schedule: daily, or every 6 hours.

Exit codes: 0 success or already current, 1 error, 2 usage error.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag) [ "$#" -ge 2 ] || die "--tag needs a value"; tag="$2"; shift 2 ;;
    --panel-dir) [ "$#" -ge 2 ] || die "--panel-dir needs a value"; panel_dir="$2"; shift 2 ;;
    --no-restart) restart=0; shift ;;
    --keep-downloads) keep_downloads=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    --quiet) quiet=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "需要 root 权限（写入 $panel_dir），请用 sudo 运行"

case "$panel_dir" in
  /|/opt) die "拒绝写入 $panel_dir：请用 --panel-dir 指定 1Panel 安装目录" ;;
esac

store_root="$panel_dir/resource/apps/local"
target="$store_root/$APP_KEY"
apps_root="$panel_dir/apps/$APP_KEY"

command -v curl >/dev/null 2>&1 || die "缺少 curl"
command -v tar >/dev/null 2>&1 || die "缺少 tar"
command -v sha256sum >/dev/null 2>&1 || die "缺少 sha256sum"

# ---------------------------------------------------------------------------
# Resolve the release tag
# ---------------------------------------------------------------------------
if [ -z "$tag" ]; then
  log "查询最新 release..."
  api="https://api.github.com/repos/$REPO/releases/latest"
  headers=(-H 'Accept: application/vnd.github+json')
  [ -n "${GITHUB_TOKEN:-}" ] && headers+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  json="$(curl -fsSL --retry 3 --connect-timeout 15 "${headers[@]}" "$api")" \
    || die "无法访问 GitHub API（可设置 GITHUB_TOKEN 提高限额，或用 --tag 指定版本）"
  tag="$(printf '%s' "$json" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')"
  [ -n "$tag" ] || die "无法从 GitHub API 解析 tag_name"
fi

case "$tag" in
  v[0-9]*) ;;
  *) die "版本号格式应为 vX.Y.Z，收到：$tag" ;;
esac

version="${tag#v}"

# ---------------------------------------------------------------------------
# Compare with what is installed
# ---------------------------------------------------------------------------
installed=""
if [ -d "$target" ]; then
  installed="$(cd "$target" && ls -1d [0-9]* 2>/dev/null | sort -V | tail -n1 || true)"
fi

if [ -n "$installed" ]; then
  newest="$(printf '%s\n%s\n' "$installed" "$version" | sort -V | tail -n1)"
  if [ "$newest" = "$installed" ]; then
    log "已是 $installed（最新 $version），无需更新"
    exit 0
  fi
  log "发现新版本：$installed -> $version"
else
  log "本地应用商店还没有 $APP_KEY，安装 $version"
fi

if [ "$dry_run" -eq 1 ]; then
  log "[dry-run] 将安装 $version 到 $target"
  [ "$restart" -eq 1 ] && log "[dry-run] 将重启 $apps_root 下的应用"
  exit 0
fi

# ---------------------------------------------------------------------------
# Download and verify
# ---------------------------------------------------------------------------
tmp="$(mktemp -d)"
cleanup() { [ "$keep_downloads" -eq 1 ] || rm -rf "$tmp"; }
trap cleanup EXIT

archive="1panel-app-${tag}.tar.gz"
base="https://github.com/$REPO/releases/download/$tag"

log "下载 $archive ..."
curl -fsSL --retry 3 --connect-timeout 15 -o "$tmp/$archive" "$base/$archive" \
  || die "下载失败：$base/$archive"
curl -fsSL --retry 3 --connect-timeout 15 -o "$tmp/SHA256SUMS" "$base/SHA256SUMS" \
  || die "下载 SHA256SUMS 失败"

expected="$(grep " ${archive}\$" "$tmp/SHA256SUMS" | awk '{print $1}' | head -n1)"
[ -n "$expected" ] || die "SHA256SUMS 中没有 $archive"
actual="$(sha256sum "$tmp/$archive" | awk '{print $1}')"
[ "$expected" = "$actual" ] || die "校验失败：期望 $expected，实际 $actual"
log "校验通过 $actual"

mkdir -p "$tmp/stage"
tar -xzf "$tmp/$archive" -C "$tmp/stage"
staged="$tmp/stage/$APP_KEY"
[ -f "$staged/data.yml" ] || die "应用包结构异常：缺少 data.yml"
[ -d "$staged/$version" ] || die "应用包结构异常：缺少 $version/ 目录"
[ -f "$staged/$version/docker-compose.yml" ] || die "应用包结构异常：缺少 $version/docker-compose.yml"

# ---------------------------------------------------------------------------
# Swap the store package (backup, never delete)
# ---------------------------------------------------------------------------
mkdir -p "$store_root"
if [ -d "$target" ]; then
  backup="${target}.bak.$(date +%Y%m%d%H%M%S)"
  log "备份旧应用包 -> $backup"
  mv "$target" "$backup"
fi
log "安装应用包 -> $target"
cp -a "$staged" "$target"
chmod -R a+rX "$target"

# Keep only the newest few backups so cron does not fill the disk.
ls -1d "${target}".bak.* 2>/dev/null | sort -r | tail -n +6 | while read -r old; do
  [ -n "$old" ] && rm -rf "$old"
done

# ---------------------------------------------------------------------------
# Restart the running app on the new image
# ---------------------------------------------------------------------------
if [ "$restart" -eq 1 ] && [ -d "$apps_root" ]; then
  command -v docker >/dev/null 2>&1 || die "应用包已更新，但缺少 docker，无法重启应用"
  found=0
  for compose in "$apps_root"/*/docker-compose.yml; do
    [ -f "$compose" ] || continue
    found=1
    app_dir="$(dirname "$compose")"
    image_ref="ghcr.io/$REPO:$tag"
    old_ref="$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$compose" | head -n1)"
    if [ "$old_ref" = "$image_ref" ]; then
      log "$app_dir 已指向 $image_ref"
    else
      log "$app_dir: $old_ref -> $image_ref"
      cp -a "$compose" "$compose.bak.$(date +%Y%m%d%H%M%S)"
      sed -i -E "s#^([[:space:]]*image:[[:space:]]*).*#\1${image_ref}#" "$compose"
    fi
    log "拉取镜像并重启 $app_dir ..."
    if ! ( cd "$app_dir" && docker compose pull -q && docker compose up -d ); then
      warn "重启 $app_dir 失败，请检查 docker compose 输出"
      exit 1
    fi
  done
  [ "$found" -eq 1 ] || log "没有已安装的应用实例，仅更新了应用商店包"
else
  log "跳过容器重启（--no-restart 或未安装该应用）"
fi

log "完成：应用商店包与运行实例已更新到 $tag"
