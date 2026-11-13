#!/usr/bin/env bash
#
# Keep the 1Panel app store package (and the running app) up to date.
#
# This is the scripted equivalent of how https://github.com/okxlin/appstore ships
# its own local app store: a 1Panel "Cron job" (计划任务, type *Shell script*)
# drops the app definition into /opt/1panel/resource/apps/local/, and the panel
# then lists the new version. Two sources are supported:
#
#   --source release (default)  download 1panel-app-<tag>.tar.gz from the latest
#                               GitHub Release, verified against SHA256SUMS
#   --source branch             download the repository tarball of a branch and
#                               copy 1panel/apps/zerotier-planet out of it — the
#                               okxlin/appstore "localApps branch" pattern
#
# After the package is in place the script (unless --no-restart) re-points the
# installed app's compose file at the new image tag and runs
# `docker compose pull && docker compose up -d`.
#
# Try it first with --dry-run, then add the cron entry:
#
#   /opt/docker-zerotier-planet-2.0/scripts/1panel-scheduled-update.sh --quiet
#
# Exit codes: 0 = success / already current, 1 = error, 2 = usage error.
#
set -Eeuo pipefail

APP_KEY=zerotier-planet
REPO="ban-sky/docker-zerotier-planet-2.0"
DEFAULT_PANEL_DIR=/opt/1panel
DEFAULT_BRANCH=main

panel_dir="${PANEL_DIR:-$DEFAULT_PANEL_DIR}"
source_mode=release
branch="$DEFAULT_BRANCH"
mirror="${GITHUB_MIRROR:-}"
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

Update the 1Panel local app store package of ZeroTier Planet (and optionally the
running container) to the newest available version.

Options:
  --source <release|branch>
                     Where to take the package from (default: release).
                       release  latest GitHub Release asset 1panel-app-<tag>.tar.gz,
                                verified against SHA256SUMS
                       branch   repository tarball of --branch, copying
                                1panel/apps/zerotier-planet out of it
                                (the okxlin/appstore localApps pattern)
  --branch <name>    Branch used by --source branch (default: main).
  --tag <vX.Y.Z>     Pin a specific release (implies --source release).
  --mirror <prefix>  Prefix GitHub URLs with a mirror, e.g.
                     --mirror https://ghproxy.net/ for mainland China.
                     Also settable as GITHUB_MIRROR.
  --panel-dir <dir>  1Panel installation directory (default: /opt/1panel,
                     or $PANEL_DIR).
  --no-restart       Only refresh the app store package; leave the running
                     container untouched.
  --keep-downloads   Leave the downloaded archive in the temp directory.
  --dry-run          Report what would change and exit without touching anything.
  --quiet            Only log warnings and errors (cron friendly).
  -h, --help         Show this help.

Typical 1Panel cron job:
  1. Panel -> Cron job -> Create -> Type: Shell script
  2. Command: /path/to/scripts/1panel-scheduled-update.sh --quiet
  3. Schedule: daily, or every 6 hours.

Without a checkout, paste this into the cron command instead:
  curl -fsSL https://raw.githubusercontent.com/ban-sky/docker-zerotier-planet-2.0/main/scripts/1panel-scheduled-update.sh -o /tmp/ztp-1panel-update.sh && bash /tmp/ztp-1panel-update.sh --quiet

Exit codes: 0 success or already current, 1 error, 2 usage error.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source) [ "$#" -ge 2 ] || die "--source 需要一个值"; source_mode="$2"; shift 2 ;;
    --branch) [ "$#" -ge 2 ] || die "--branch 需要一个值"; branch="$2"; shift 2 ;;
    --tag) [ "$#" -ge 2 ] || die "--tag 需要一个值"; tag="$2"; source_mode=release; shift 2 ;;
    --mirror) [ "$#" -ge 2 ] || die "--mirror 需要一个值"; mirror="$2"; shift 2 ;;
    --panel-dir) [ "$#" -ge 2 ] || die "--panel-dir 需要一个值"; panel_dir="$2"; shift 2 ;;
    --no-restart) restart=0; shift ;;
    --keep-downloads) keep_downloads=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    --quiet) quiet=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

case "$source_mode" in
  release|branch) ;;
  *) die "--source 只能是 release 或 branch，收到：$source_mode" ;;
esac

if [ -n "$mirror" ] && [ "${mirror%/}" = "$mirror" ]; then
  mirror="$mirror/"
fi

# Root is required because the package lands under /opt/1panel. Set
# ZTP_SKIP_ROOT_CHECK=1 to exercise the script against a throwaway --panel-dir.
if [ "${ZTP_SKIP_ROOT_CHECK:-0}" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  die "需要 root 权限（写入 $panel_dir），请用 sudo 运行"
fi

case "$panel_dir" in
  /|/opt) die "拒绝写入 $panel_dir：请用 --panel-dir 指定 1Panel 安装目录" ;;
esac

store_root="$panel_dir/resource/apps/local"
target="$store_root/$APP_KEY"
apps_root="$panel_dir/apps/$APP_KEY"

command -v curl >/dev/null 2>&1 || die "缺少 curl"
command -v tar >/dev/null 2>&1 || die "缺少 tar"

# Prefix a GitHub URL with the optional mirror (ghproxy.net/ghproxy.com style).
gh_url() {
  if [ -n "$mirror" ]; then printf '%s%s' "$mirror" "$1"; else printf '%s' "$1"; fi
}

fetch() { # url dest
  curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15 -o "$2" "$1" \
    || die "下载失败：$1"
}

# Highest installed version directory, or empty.
installed_version() {
  if [ -d "$target" ]; then
    ( cd "$target" && ls -1d [0-9]* 2>/dev/null | sort -V | tail -n1 ) || true
  fi
}

# True when $1 is not older than $2 (both x.y.z).
not_older() {
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]
}

tmp="$(mktemp -d)"
cleanup() { [ "$keep_downloads" -eq 1 ] || rm -rf "$tmp"; }
trap cleanup EXIT

installed="$(installed_version)"

# ---------------------------------------------------------------------------
# Resolve the version to install and stage the package
# ---------------------------------------------------------------------------
if [ "$source_mode" = release ]; then
  if [ -z "$tag" ]; then
    log "查询最新 release..."
    api="https://api.github.com/repos/$REPO/releases/latest"
    headers=(-H 'Accept: application/vnd.github+json')
    [ -n "${GITHUB_TOKEN:-}" ] && headers+=(-H "Authorization: Bearer $GITHUB_TOKEN")
    json="$(curl -fsSL --retry 3 --connect-timeout 15 "${headers[@]}" "$api")" \
      || die "无法访问 GitHub API（可设置 GITHUB_TOKEN，或用 --tag 指定版本）"
    tag="$(printf '%s' "$json" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')"
    [ -n "$tag" ] || die "无法从 GitHub API 解析 tag_name"
  fi
  case "$tag" in
    v[0-9]*) ;;
    *) die "版本号格式应为 vX.Y.Z，收到：$tag" ;;
  esac
  version="${tag#v}"

  if [ -n "$installed" ] && not_older "$installed" "$version"; then
    log "已是 $installed（最新 $version），无需更新"
    exit 0
  fi

  if [ "$dry_run" -eq 1 ]; then
    log "[dry-run] 将安装 release $tag 到 $target（当前：${installed:-未安装}）"
    [ "$restart" -eq 1 ] && log "[dry-run] 之后会重启 $apps_root 下的应用"
    exit 0
  fi

  archive="1panel-app-${tag}.tar.gz"
  base="https://github.com/$REPO/releases/download/$tag"
  log "下载 $archive ..."
  fetch "$(gh_url "$base/$archive")" "$tmp/$archive"
  fetch "$(gh_url "$base/SHA256SUMS")" "$tmp/SHA256SUMS"

  expected="$(grep " ${archive}\$" "$tmp/SHA256SUMS" | awk '{print $1}' | head -n1)"
  [ -n "$expected" ] || die "SHA256SUMS 中没有 $archive"
  actual="$(sha256sum "$tmp/$archive" | awk '{print $1}')"
  [ "$expected" = "$actual" ] || die "校验失败：期望 $expected，实际 $actual"
  log "校验通过 $actual"

  mkdir -p "$tmp/stage"
  tar -xzf "$tmp/$archive" -C "$tmp/stage"
  staged="$tmp/stage/$APP_KEY"
else
  url="https://github.com/$REPO/archive/refs/heads/$branch.tar.gz"
  log "下载 $branch 分支快照 ..."
  fetch "$(gh_url "$url")" "$tmp/repo.tar.gz"
  mkdir -p "$tmp/stage"
  tar -xzf "$tmp/repo.tar.gz" -C "$tmp/stage" --strip-components=1
  staged="$tmp/stage/1panel/apps/$APP_KEY"
  [ -d "$staged" ] || die "分支 $branch 中没有 1panel/apps/$APP_KEY"

  version="$( cd "$staged" && ls -1d [0-9]* 2>/dev/null | sort -V | tail -n1 )" \
    || version=""
  [ -n "$version" ] || die "分支 $branch 的应用包里没有版本目录"
  tag="v$version"

  if [ -n "$installed" ] && not_older "$installed" "$version"; then
    log "已是 $installed（分支最新 $version），无需更新"
    exit 0
  fi

  if [ "$dry_run" -eq 1 ]; then
    log "[dry-run] 将从分支 $branch 安装 $version 到 $target（当前：${installed:-未安装}）"
    [ "$restart" -eq 1 ] && log "[dry-run] 之后会重启 $apps_root 下的应用"
    exit 0
  fi
fi

[ -f "$staged/data.yml" ] || die "应用包结构异常：缺少 data.yml"
[ -d "$staged/$version" ] || die "应用包结构异常：缺少 $version/ 目录"
[ -f "$staged/$version/docker-compose.yml" ] || die "应用包结构异常：缺少 $version/docker-compose.yml"

# ---------------------------------------------------------------------------
# Swap the store package (backup kept, never deleted in place)
# ---------------------------------------------------------------------------
mkdir -p "$store_root"
if [ -d "$target" ]; then
  backup="${target}.bak.$(date +%Y%m%d%H%M%S)"
  log "备份旧应用包 -> $backup"
  mv "$target" "$backup"
fi
log "安装应用包 $version -> $target"
cp -a "$staged" "$target"
chmod -R a+rX "$target"

# Keep only the newest five backups so a cron job cannot fill the disk.
shopt -s nullglob
backups=("${target}".bak.*)
shopt -u nullglob
if [ "${#backups[@]}" -gt 5 ]; then
  printf '%s\n' "${backups[@]}" | sort -r | tail -n +6 | while read -r old; do
    [ -n "$old" ] || continue
    rm -rf -- "$old"
  done
fi

# ---------------------------------------------------------------------------
# Restart the running app on the new image
# ---------------------------------------------------------------------------
if [ "$restart" -eq 1 ] && [ -d "$apps_root" ]; then
  command -v docker >/dev/null 2>&1 || die "应用包已更新，但缺少 docker，无法重启应用"
  image_ref="ghcr.io/$REPO:v$version"
  found=0
  for compose in "$apps_root"/*/docker-compose.yml; do
    [ -f "$compose" ] || continue
    found=1
    app_dir="$(dirname "$compose")"
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

log "完成：应用商店包已更新到 $version${installed:+（原 $installed）}"
