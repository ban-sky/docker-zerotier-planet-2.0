#!/usr/bin/env bash
#
# Keep the 1Panel app store package (and the running app) up to date.
#
# This is the scripted equivalent of how https://github.com/okxlin/appstore ships
# its own local app store: a 1Panel "Cron job" (计划任务, type *Shell script*)
# drops the app definition into /opt/1panel/resource/apps/local/, and the panel
# then lists the new version.
#
# Sources, in the order the default (`auto`) tries them:
#
#   release  1panel-app-<tag>.tar.gz from the newest GitHub Release, verified
#            against SHA256SUMS. Falls back to the GitHub mirrors below.
#   cdn      the same files assembled from jsDelivr (cdn.jsdelivr.net and its
#            sibling hosts), which stays reachable on mainland-China servers
#            where github.com / api.github.com are blocked.
#   branch   the repository tarball of --branch, copying
#            1panel/apps/zerotier-planet out of it (the okxlin/appstore
#            "localApps branch" pattern).
#   dir      a local directory (--from-dir), no network at all.
#
# After the package is in place the script (unless --no-restart) re-points the
# installed app's compose file at the new image tag and runs
# `docker compose pull && docker compose up -d`.
#
# Try it first with --dry-run, then add the cron entry:
#
#   /opt/zerotier-planet-2.0/scripts/1panel-scheduled-update.sh --quiet
#
# Exit codes: 0 = success / already current, 1 = error, 2 = usage error.
#
set -Eeuo pipefail

APP_KEY=zerotier-planet
REPO="ban-sky/zerotier-planet-2.0"
IMAGE="${IMAGE:-docker.io/lonelyx/zerotier-planet}"
DEFAULT_PANEL_DIR=/opt/1panel
DEFAULT_BRANCH=main

# jsDelivr serves repository files from GitHub's CDN and is reachable from
# mainland China; the sibling hosts are the usual fallbacks.
CDN_BASES=(
  "https://cdn.jsdelivr.net/gh"
  "https://fastly.jsdelivr.net/gh"
  "https://gcore.jsdelivr.net/gh"
  "https://testingcf.jsdelivr.net/gh"
)

# ghproxy-style front ends for github.com. They are only used once the direct
# request has failed, so a working network never pays for them.
DEFAULT_MIRRORS=(
  "https://ghfast.top/"
  "https://gh-proxy.com/"
  "https://ghproxy.net/"
)

panel_dir="${PANEL_DIR:-$DEFAULT_PANEL_DIR}"
source_mode=auto
branch="$DEFAULT_BRANCH"
tag=""
from_dir=""
mirrors=()
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
  --source <auto|release|cdn|branch|dir>
                     Where to take the package from (default: auto).
                       auto     try release, then fall back to cdn
                       release  newest GitHub Release asset
                                1panel-app-<tag>.tar.gz, verified against
                                SHA256SUMS
                       cdn      assemble the same files from jsDelivr; use this
                                on mainland-China servers where github.com is
                                unreachable
                       branch   repository tarball of --branch, copying
                                1panel/apps/zerotier-planet out of it
                                (the okxlin/appstore localApps pattern)
                       dir      install from --from-dir, no network at all
  --from-dir <path>  Repository checkout (or the app directory itself) used by
                     --source dir. Implies --source dir.
  --branch <name>    Branch used by --source branch (default: main).
  --tag <vX.Y.Z>     Pin a specific release (implies --source release).
  --mirror <prefix>  Extra GitHub mirror for release downloads, e.g.
                     --mirror https://ghproxy.net/ . May be repeated. When it is
                     omitted a built-in list is tried after the direct request.
                     Also settable as GITHUB_MIRROR.
  --panel-dir <dir>  1Panel installation directory (default: /opt/1panel, or
                     $PANEL_DIR).
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
  curl -fsSL https://raw.githubusercontent.com/ban-sky/zerotier-planet-2.0/main/scripts/1panel-scheduled-update.sh -o /tmp/ztp-1panel-update.sh && bash /tmp/ztp-1panel-update.sh --quiet

If that download itself is blocked, take the script from the CDN:
  curl -fsSL https://cdn.jsdelivr.net/gh/ban-sky/zerotier-planet-2.0@main/scripts/1panel-scheduled-update.sh -o /tmp/ztp-1panel-update.sh

Exit codes: 0 success or already current, 1 error, 2 usage error.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source) [ "$#" -ge 2 ] || die "--source 需要一个值"; source_mode="$2"; shift 2 ;;
    --from-dir) [ "$#" -ge 2 ] || die "--from-dir 需要一个值"; from_dir="$2"; source_mode=dir; shift 2 ;;
    --branch) [ "$#" -ge 2 ] || die "--branch 需要一个值"; branch="$2"; shift 2 ;;
    --tag) [ "$#" -ge 2 ] || die "--tag 需要一个值"; tag="$2"; shift 2 ;;
    --mirror) [ "$#" -ge 2 ] || die "--mirror 需要一个值"; mirrors+=("$2"); shift 2 ;;
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
  auto|release|cdn|branch|dir) ;;
  *) die "--source 只能是 auto、release、cdn、branch 或 dir，收到：$source_mode" ;;
esac

# --tag pins a release, so keep the mode consistent with it.
if [ -n "$tag" ] && [ "$source_mode" = auto ]; then
  source_mode=release
fi

# An explicit --mirror wins; otherwise try the built-in front ends after the
# direct request. GITHUB_MIRROR is the environment-variable spelling.
if [ "${#mirrors[@]}" -eq 0 ] && [ -n "${GITHUB_MIRROR:-}" ]; then
  mirrors=("$GITHUB_MIRROR")
fi
if [ "${#mirrors[@]}" -eq 0 ]; then
  mirrors=("${DEFAULT_MIRRORS[@]}")
fi
for i in "${!mirrors[@]}"; do
  case "${mirrors[$i]}" in
    */) ;;
    *) mirrors[$i]="${mirrors[$i]}/" ;;
  esac
done

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

# One attempt, short and bounded: a blocked host has to fail fast instead of
# retrying for minutes (that is what made this script look like it "kept
# retrying" on mainland-China servers).
curl_get() { # url dest
  curl -fsSL --connect-timeout 8 --max-time 180 --retry 1 --retry-delay 1 -o "$2" "$1"
}

# Try the URL directly, then through every configured mirror.
fetch_any() { # url dest
  local url="$1" dest="$2" base
  if curl_get "$url" "$dest"; then return 0; fi
  for base in "${mirrors[@]}"; do
    if curl_get "${base}${url}" "$dest"; then
      log "（经镜像 $base）"
      return 0
    fi
  done
  return 1
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

# Newest tag without requiring api.github.com, which is blocked in some
# networks. Three independent channels, cheapest first.
resolve_tag() {
  local base redirect api body versions
  local -a headers=(-H 'Accept: application/vnd.github+json')

  # 1. the /releases/latest redirect: plain github.com, so mirrors proxy it too
  for base in "" "${mirrors[@]}"; do
    redirect="$(curl -fsS -o /dev/null -w '%{redirect_url}' --connect-timeout 8 --max-time 30 \
      "${base}https://github.com/$REPO/releases/latest" 2>/dev/null || true)"
    tag="$(printf '%s' "$redirect" | sed -n 's#.*/tag/\(v[0-9][^/]*\)$#\1#p')"
    if [ -n "$tag" ]; then return 0; fi
  done

  # 2. the REST API, optionally through a mirror and with a token
  api="https://api.github.com/repos/$REPO/releases/latest"
  [ -n "${GITHUB_TOKEN:-}" ] && headers+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  for base in "" "${mirrors[@]}"; do
    body="$(curl -fsSL --connect-timeout 8 --max-time 30 "${headers[@]}" "${base}${api}" 2>/dev/null || true)"
    tag="$(printf '%s' "$body" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    if [ -n "$tag" ]; then return 0; fi
  done

  # 3. jsDelivr's package metadata: reachable where the two above are not
  body="$(curl -fsSL --connect-timeout 8 --max-time 30 \
    "https://data.jsdelivr.com/v1/packages/gh/$REPO" 2>/dev/null || true)"
  versions="$(printf '%s' "$body" | grep -o '"version":"[0-9][^"]*"' | sed 's/.*"version":"\([^"]*\)"/\1/' | sort -V | tail -n1)"
  if [ -n "$versions" ]; then tag="v$versions"; return 0; fi

  return 1
}

stage_release() { # needs $tag, $version, $tmp
  local archive="1panel-app-${version}.tar.gz"
  local base="https://github.com/$REPO/releases/download/$tag"
  local expected actual

  log "下载 $archive ..."
  fetch_any "$base/$archive" "$tmp/$archive" || return 1
  fetch_any "$base/SHA256SUMS" "$tmp/SHA256SUMS" || return 1

  expected="$(grep " ${archive}\$" "$tmp/SHA256SUMS" | awk '{print $1}' | head -n1)"
  [ -n "$expected" ] || { warn "SHA256SUMS 中没有 $archive"; return 1; }
  actual="$(sha256sum "$tmp/$archive" | awk '{print $1}')"
  [ "$expected" = "$actual" ] || { warn "校验失败：期望 $expected，实际 $actual"; return 1; }
  log "校验通过 $actual"

  mkdir -p "$tmp/stage"
  tar -xzf "$tmp/$archive" -C "$tmp/stage" || return 1
  staged="$tmp/stage/$APP_KEY"
  [ -d "$staged" ] || { warn "压缩包里没有 $APP_KEY 目录"; return 1; }
}

stage_cdn() { # needs $tag, $version, $tmp
  local -a files=(
    "data.yml"
    "README.md"
    "README_en.md"
    "logo.png"
    "$version/data.yml"
    "$version/docker-compose.yml"
  )
  local cdn f ok
  for cdn in "${CDN_BASES[@]}"; do
    rm -rf "$tmp/cdn"
    mkdir -p "$tmp/cdn"
    ok=1
    for f in "${files[@]}"; do
      mkdir -p "$tmp/cdn/$(dirname "$f")"
      if ! curl_get "$cdn/$REPO@$tag/1panel/apps/$APP_KEY/$f" "$tmp/cdn/$f"; then
        ok=0
        break
      fi
    done
    if [ "$ok" -eq 1 ]; then
      staged="$tmp/cdn"
      log "（经 CDN $cdn）"
      return 0
    fi
  done
  return 1
}

stage_branch() {
  local url="https://github.com/$REPO/archive/refs/heads/$branch.tar.gz"
  log "下载 $branch 分支快照 ..."
  fetch_any "$url" "$tmp/repo.tar.gz" || return 1
  mkdir -p "$tmp/stage"
  tar -xzf "$tmp/repo.tar.gz" -C "$tmp/stage" --strip-components=1 || return 1
  staged="$tmp/stage/1panel/apps/$APP_KEY"
  [ -d "$staged" ] || { warn "分支 $branch 中没有 1panel/apps/$APP_KEY"; return 1; }
}

stage_dir() {
  local src
  if [ -d "$from_dir/1panel/apps/$APP_KEY" ]; then
    src="$from_dir/1panel/apps/$APP_KEY"
  elif [ -f "$from_dir/data.yml" ]; then
    src="$from_dir"
  else
    warn "$from_dir 既不是仓库根目录，也不是 $APP_KEY 应用目录"
    return 1
  fi
  mkdir -p "$tmp/stage"
  cp -a "$src" "$tmp/stage/$APP_KEY"
  staged="$tmp/stage/$APP_KEY"
}

tmp="$(mktemp -d)"
cleanup() { [ "$keep_downloads" -eq 1 ] || rm -rf "$tmp"; }
trap cleanup EXIT

installed="$(installed_version)"

# ---------------------------------------------------------------------------
# Resolve the version to install
# ---------------------------------------------------------------------------
if [ "$source_mode" != branch ] && [ "$source_mode" != dir ]; then
  if [ -z "$tag" ]; then
    log "查询最新版本..."
    resolve_tag || die "无法确定最新版本：github.com、api.github.com 与 jsDelivr 都不可达。可加 --mirror 指定镜像、用 --tag 固定版本，或用 --source dir 从本地目录安装"
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
    log "[dry-run] 将安装 $tag 到 $target（当前：${installed:-未安装}；来源：$source_mode）"
    if [ "$restart" -eq 1 ]; then log "[dry-run] 之后会重启 $apps_root 下的应用"; fi
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Stage the package
# ---------------------------------------------------------------------------
case "$source_mode" in
  release)
    stage_release || die "release 下载失败：可加 --mirror 指定镜像，或用 --source cdn / --source dir"
    ;;
  cdn)
    stage_cdn || die "jsDelivr 下载失败：可用 --source dir 从本地目录安装"
    ;;
  auto)
    if ! stage_release; then
      warn "GitHub Release 下载失败，改用 jsDelivr CDN 拼装应用包"
      stage_cdn || die "Release 与 jsDelivr 都失败：请检查网络，或用 --source dir 从本地目录安装"
    fi
    ;;
  branch)
    stage_branch || die "分支 $branch 下载失败：可加 --mirror 指定镜像，或用 --source dir"
    version="$( cd "$staged" && ls -1d [0-9]* 2>/dev/null | sort -V | tail -n1 )" || version=""
    [ -n "$version" ] || die "分支 $branch 的应用包里没有版本目录"
    tag="$version"

    if [ -n "$installed" ] && not_older "$installed" "$version"; then
      log "已是 $installed（分支最新 $version），无需更新"
      exit 0
    fi
    if [ "$dry_run" -eq 1 ]; then
      log "[dry-run] 将从分支 $branch 安装 $version 到 $target（当前：${installed:-未安装}）"
      if [ "$restart" -eq 1 ]; then log "[dry-run] 之后会重启 $apps_root 下的应用"; fi
      exit 0
    fi
    ;;
  dir)
    stage_dir || die "本地目录 $from_dir 不可用"
    version="$( cd "$staged" && ls -1d [0-9]* 2>/dev/null | sort -V | tail -n1 )" || version=""
    [ -n "$version" ] || die "本地应用包里没有版本目录"
    tag="v$version"

    if [ -n "$installed" ] && not_older "$installed" "$version"; then
      log "已是 $installed（本地最新 $version），无需更新"
      exit 0
    fi
    if [ "$dry_run" -eq 1 ]; then
      log "[dry-run] 将从 $from_dir 安装 $version 到 $target（当前：${installed:-未安装}）"
      if [ "$restart" -eq 1 ]; then log "[dry-run] 之后会重启 $apps_root 下的应用"; fi
      exit 0
    fi
    ;;
esac

[ -f "$staged/data.yml" ] || die "应用包结构异常：缺少 data.yml"
[ -d "$staged/$version" ] || die "应用包结构异常：缺少 $version/ 目录"
[ -f "$staged/$version/docker-compose.yml" ] || die "应用包结构异常：缺少 $version/docker-compose.yml"

# ---------------------------------------------------------------------------
# Swap the store package (old copy moved aside, never deleted in place)
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
  image_ref="$IMAGE:$version"
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
      sed -i -E "s#^([[:space:]]*image:[[:space:]]*)[^[:space:]]*#\1${image_ref}#" "$compose"
    fi
    log "拉取镜像并重启 $app_dir ..."
    if ! ( cd "$app_dir" && docker compose pull -q && docker compose up -d ); then
      warn "重启 $app_dir 失败，请检查 docker compose 的输出"
      exit 1
    fi
  done
  if [ "$found" -eq 0 ]; then log "没有已安装的应用实例，仅更新了应用商店包"; fi
else
  log "跳过容器重启（--no-restart 或未安装该应用）"
fi

log "完成：应用商店包已更新到 $version${installed:+（原 $installed）}"
