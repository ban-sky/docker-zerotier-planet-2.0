#!/usr/bin/env bash
# Install the bundled 1Panel app package into the local app store.
#
# 1Panel 社区版的应用商店只扫描本机目录：
#   /opt/1panel/resource/apps/local/<app-key>/
# 本脚本把仓库里的 1panel/apps/zerotier-planet 复制到该目录，之后在面板里
# 「应用商店 → 更新应用列表」即可看到 ZeroTier Planet。
set -Eeuo pipefail

APP_KEY="zerotier-planet"
PANEL_DIR="${PANEL_DIR:-/opt/1panel}"
LOCAL_DIR=""
DOWNLOAD_VERSION=""
KEEP_OLD=0

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASES_URL="https://github.com/ban-sky/docker-zerotier-planet-2.0/releases/download"

usage() {
    cat <<'EOF'
用法: install-1panel-app.sh [选项]

  --panel-dir DIR        1Panel 安装目录，默认 /opt/1panel
  --download VERSION     从 GitHub Releases 下载 1panel-app-VERSION.tar.gz
                         （例如 --download v2.1.0），而不是使用仓库内的文件
  --keep-old             保留上一次安装的备份（默认保留，仅提示路径）
  -h, --help             显示帮助

环境变量:
  PANEL_DIR              同 --panel-dir
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --panel-dir) PANEL_DIR="${2:?--panel-dir 需要参数}"; shift 2 ;;
        --download) DOWNLOAD_VERSION="${2:?--download 需要参数}"; shift 2 ;;
        --keep-old) KEEP_OLD=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
    esac
done

LOCAL_DIR="$PANEL_DIR/resource/apps/local"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "需要 root 权限（写入 $LOCAL_DIR），请用 sudo 运行"

TMP_DIR=""
cleanup() {
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf -- "$TMP_DIR"
    fi
}
trap cleanup EXIT

if [ -n "$DOWNLOAD_VERSION" ]; then
    command -v curl >/dev/null 2>&1 || die "需要 curl 下载应用包"
    TMP_DIR="$(mktemp -d)"
    url="$RELEASES_URL/$DOWNLOAD_VERSION/1panel-app-$DOWNLOAD_VERSION.tar.gz"
    log "下载 $url"
    curl -fsSL "$url" -o "$TMP_DIR/pkg.tar.gz" || die "下载失败: $url"
    tar -xzf "$TMP_DIR/pkg.tar.gz" -C "$TMP_DIR"
    SRC_DIR="$TMP_DIR/$APP_KEY"
else
    SRC_DIR="$REPO_ROOT/1panel/apps/$APP_KEY"
fi

[ -d "$SRC_DIR" ] || die "找不到应用包目录: $SRC_DIR（请在仓库根目录运行，或使用 --download）"
[ -f "$SRC_DIR/data.yml" ] || die "$SRC_DIR 缺少 data.yml，不像 1Panel 应用包"

case "$LOCAL_DIR" in
    /|/opt|/opt/1panel) die "拒绝写入 $LOCAL_DIR，请确认 --panel-dir" ;;
esac

log "安装 1Panel 应用: $SRC_DIR -> $LOCAL_DIR/$APP_KEY"
mkdir -p -- "$LOCAL_DIR"

TARGET="$LOCAL_DIR/$APP_KEY"
if [ -e "$TARGET" ]; then
    backup="$TARGET.bak.$(date +%Y%m%d%H%M%S)"
    log "已有旧版本，移动到 $backup"
    mv -- "$TARGET" "$backup"
    if [ "$KEEP_OLD" -eq 0 ]; then
        log "旧版本备份保留在 $backup（确认无误后可手动删除）"
    fi
fi

cp -a -- "$SRC_DIR" "$TARGET"
chmod -R a+rX -- "$TARGET"

cat <<EOF

完成。接下来：

  1. 打开 1Panel → 应用商店 → 点击「更新应用列表」
  2. 搜索 "ZeroTier Planet" → 安装
  3. 安装时填写公网 IPv4 与端口；装好后在应用「终端」里执行
       cat /app/config/admin-password
     用 admin + 该密码登录 https://<服务器IP>:<管理界面端口>
  4. 记得放行 UDP 9994（ZeroTier）与 TCP 3443 / 3000

已安装版本目录: $TARGET
EOF
