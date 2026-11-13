# zerotier-planet-2.0（安全加固版）

在 Docker 中自建 **ZeroTier 行星服务器（planet）** 和 **网络控制器（ztncui）**。
本项目是 [xubiaolin/docker-zerotier-planet](https://github.com/xubiaolin/docker-zerotier-planet)
的 **2.0** 维护分支，已升级到 **ZeroTier One 1.16.2**（截至 2026-11-06 核查，上游最新稳定版仍是 1.16.2），并针对上游 issue 中的安全问题做了系统性加固。

> **2.4.3 起默认使用 Docker Hub 镜像**
> 项目名是 `zerotier-planet-2.0`（2.4.2 起由 `docker-zerotier-planet-2.0` 更名而来）；镜像同时发布到
> `docker.io/lonelyx/zerotier-planet`（**默认**）与 `ghcr.io/ban-sky/zerotier-planet`（备选），
> tag 与版本号一致、**不带 `v`**（git tag 与 Release 仍是 `v2.4.3`）。旧仓库地址与旧镜像名继续可用。

> **许可证提醒（重要）**
> ZeroTier 1.16 起把 controller 移到了 `nonfree/`，采用 *ZeroTier SOURCE-AVAILABLE
> LICENSE*，**仅允许个人非商业用途**（以及学生教育/学术、30 天以内的评估）。
> 本镜像因此以 `ZT_NONFREE=1` 构建。公司、政府/军队、非营利组织或任何付费服务
> 场景**不得**使用本镜像中的 controller。详见 [NOTICE](NOTICE) 与
> `/usr/share/licenses/zerotier/`。

## 目录

- [界面预览](#界面预览)
- [相比上游的改动](#相比上游的改动)
- [快速开始](#快速开始)：[脚本](#方式一脚本) · [Compose](#方式二compose) · [1Panel 应用商店](#方式三1panel-应用商店)
- [配置](#配置) · [数据与备份](#数据与备份) · [从上游版本迁移](#从上游版本迁移)
- [本地构建与测试](#本地构建与测试) · [GitHub Actions 构建与发布](#github-actions-构建与发布) · [镜像地址](#镜像地址)
- [安全模型与限制](#安全模型与限制) · [故障排查](#故障排查) · [更新日志](CHANGELOG.md)

## 界面预览

管理界面（ztncui 0.9.0）重做为响应式卡片布局：移除了 Bootstrap 3 与 jQuery，
CSP 只允许 `'self'`，成员授权与桥接使用显式下拉框。截图取自 2.3.x 构建，
2.4.0 在此基础上去掉了页面上的多余说明文字，结构不变。

| 控制器概览 | 网络列表 |
| --- | --- |
| ![控制器概览](docs/screenshots/ztncui-overview.png) | ![网络列表](docs/screenshots/ztncui-networks.png) |

![网络详情：成员授权、桥接、IP 分配与网络属性](docs/screenshots/ztncui-network-detail.png)

手机端（≤720px）表格自动转换为带字段标签的卡片，导航折叠为菜单：

| 网络列表（手机） | 网络详情（手机） |
| --- | --- |
| ![手机端网络列表](docs/screenshots/ztncui-mobile-networks.png) | ![手机端网络详情](docs/screenshots/ztncui-mobile-network-detail.png) |

## 相比上游的改动

### 安全（对应 issue #215 的五项）

| 问题 | 处理方式 |
| --- | --- |
| 默认 `admin/password` 凭据 | 首次启动生成 24 字符随机密码，写入 `config/admin-password`（0600），首次登录强制改密，改密后自动删除该文件 |
| 文件服务器路径穿越 | 仅允许 `planet` 与 `*.moon`；`realpath` 必须仍位于 `dist/` 内；拒绝符号链接逃逸、`..`、编码穿越 |
| 下载密钥放在 URL query | 默认只接受 `Authorization: Bearer` / `X-Api-Key`；32 字节随机密钥持久化到 0600 文件；`?key=` 仅在显式设置 `ALLOW_QUERY_KEY=1` 时启用 |
| 依赖未锁版本 | ZeroTier 固定到 `1.16.2` + commit 校验；ztncui 固定 commit；npm 使用提交的 lockfile 与 `npm ci --omit=dev --ignore-scripts` |
| 管理界面/文件服务器明文 HTTP | 默认 TLS（自签 ECDSA P-256，SAN 含服务器 IP），TLS 1.2+、HSTS；可挂载自有证书 |

### 其他 issue

- **#213**：1.16 删除了 `attic/world`，旧 `mkworld` 无法编译。已按 `node/World.hpp` + `ECC` API 重写 `mkworld`，并用同一身份签名/校验生成的 planet。
- **#200**：`deploy.sh` 的端口提示不再被命令替换吞掉，端口严格校验 `1-65535`。
- **#180**：`docker run` 前先 `mkdir -p` 数据目录，兼容 podman。
- **#196**：镜像内提供 `/usr/sbin/zerotier-cli`、`zerotier-idtool`，可直接 `docker exec`；不再需要 `/bak` 模板。
- **#208**：`activeBridge`/`auth` 严格按布尔值处理，字符串 `"false"` 不再被当成真。
- **#185**：用带 TTL 的 `BoundedMemoryStore` 替代会告警的默认 MemoryStore。
- **#163**：不再自己生成 authtoken，而是等待 ZeroTier 生成后读取，避免 controller API 401。
- **#216**：提供 `build.sh` 多架构构建与本地 `Dockerfile`，不再依赖上游 Docker Hub 镜像；发布时同时推 GHCR 与 Docker Hub（见 [镜像地址](#镜像地址)）。
- **#157**：可设置 `HTTPS_HOST=::` 让管理界面同时监听 IPv6（默认 `0.0.0.0`）。
- **#205**：仅构建 `linux/amd64` 与 `linux/arm64`，不提供 armv7。

### 其他加固

- `zerotier-one` 以 root 运行（daemon 拒绝非 root 启动）；ztncui 与文件服务器以 uid/gid 1000 运行，entrypoint 仅在修正卷权限和启动 ZeroTier 时使用 root。
- 删除 `set -x`，日志不会出现 authtoken、controller token 或下载密钥。
- ztncui：CSP、HSTS、SameSite/HttpOnly/Secure Cookie、同源 Origin/Referer 校验、
  登录限流、开放重定向修复、原型链用户名 DoS 修复、会话固定修复、错误页不泄漏堆栈。
- 原生 `argon2` 改为纯 WASM `hash-wasm`，无需 node-gyp，并统一使用 Argon2id（64 MiB）。
- ztncui 前端与依赖整体重写（0.9.0）：移除 Bootstrap 3 / jQuery / got / ip-address /
  express-validator，改用 `node:net` 实现 IP/CIDR 校验、Node 24 原生 `fetch` 调用
  controller API，并适配 1.16 的 `POST /controller/network`；生产依赖 `npm audit`
  在 2026-11-06 为 0 告警。
- 管理界面重做为响应式卡片/表格布局，手机端（≤720px）表格自动变为带字段标签的卡片、导航折叠、工具栏横向滚动、触控目标 ≥42px；无内联脚本与样式（CSP 只允许 `'self'`），
  成员授权/桥接改为显式下拉框，保持 #208 的严格布尔语义。
- 密码文件原子写入、0600；已设置密码的账户只能由本人修改；管理员可为新建用户设置初始密码；不能删除自己或最后一个管理员。
- `docker-compose.yml` 默认 `read_only`、`no-new-privileges`、`tmpfs /tmp`。
- 增加 `SECURITY.md`、漏洞披露流程、依赖锁定和回归测试。

### 2.2.0 的修复与新增

- **修复登录报 `Bad request origin`**：来源校验改为比较主机名，并信任代理转发的
  `X-Forwarded-Host`（见[反向代理与来源校验](#反向代理与来源校验)），反代、端口重映射、
  Origin 省略默认端口都不再误判；跨站提交仍然拒绝。新增 `tests/origin.test.js`。
- **界面支持简体中文**：服务端渲染的整套管理界面有中英两套文案，默认 `zh-CN`，
  右上角切换，选择存 cookie。
- **1Panel 计划任务脚本**：`scripts/1panel-scheduled-update.sh` 可挂到面板计划任务，
  按周期更新应用商店包并重启已安装实例。

### 部署集成（2.4.3）

- 附带 1Panel 应用包（`1panel/apps/zerotier-planet`）与安装脚本，可在面板里填表安装、
  可视化启停与升级；镜像 tag 固定版本号（如 `2.4.3`，不带 `v`），方便面板比对版本。
- 应用包、`docker save` 归档与计划任务脚本一起发布在 Release，`SHA256SUMS` 覆盖全部附件。

## 快速开始

三种部署方式任选其一，装机结果一致（同一个镜像、同一套数据目录）：

| 方式 | 适合场景 | 说明 |
| --- | --- | --- |
| [脚本](#方式一脚本) | 普通 Linux 主机 | 交互式询问公网 IP 与端口，自动建目录、构建或拉取镜像并等待健康检查 |
| [Compose](#方式二compose) | 已有 compose 工作流 | 手写 `.env`，参数完全可控 |
| [1Panel 应用商店](#方式三1panel-应用商店) | 已在用 1Panel 面板 | 仓库自带应用包，面板里填表安装，后续可视化启停/升级 |

### 要求

- Docker 24+ / Docker Compose v2；`amd64` 或 `arm64`
- 一台有公网 IPv4 的 Linux 主机（NAT 后需要端口映射）
- 放行 **UDP 9994**；管理界面 **TCP 3443**；planet 下载 **TCP 3000**
- 约 512 MiB 内存、1 GiB 磁盘

### 方式一：脚本

```bash
git clone https://github.com/ban-sky/zerotier-planet-2.0.git
cd zerotier-planet-2.0
./deploy.sh
```

脚本会询问公网 IP 和端口，创建 `data/` 目录；本地没有镜像时先构建，然后启动容器并等待健康检查。
已有同名容器时会先询问是否替换；数据目录不会被删除。

> **不想在服务器上编译？** 直接下载
> [Releases](https://github.com/ban-sky/zerotier-planet-2.0/releases) 里的
> `zerotier-planet-2.0-<版本>-amd64.tar.gz`，`docker load` 后即可运行；
> 也可以直接 `docker pull docker.io/lonelyx/zerotier-planet:2.4.3`。

### 方式二：Compose

```bash
git clone https://github.com/ban-sky/zerotier-planet-2.0.git
cd zerotier-planet-2.0
cat > .env <<'EOF'
IP_ADDR4=203.0.113.10
# IP_ADDR6=2001:db8::10
EOF
# 首次使用本地构建
docker compose up -d --build
```

### 方式三：1Panel 应用商店

仓库自带 1Panel 应用包（[`1panel/apps/zerotier-planet`](1panel)），装进面板的本地应用商店
后即可可视化安装。

```bash
git clone https://github.com/ban-sky/zerotier-planet-2.0.git
cd zerotier-planet-2.0
sudo ./scripts/install-1panel-app.sh
```

不想 clone 也可以用 Release 附件：

```bash
sudo tar -xzf 1panel-app-2.4.3.tar.gz -C /opt/1panel/resource/apps/local
```

然后在 1Panel 里 **应用商店 → 更新应用列表**，搜索 `ZeroTier Planet` 安装。安装表单：

| 字段 | 说明 |
| --- | --- |
| 公网 IPv4 | planet 对外公布的地址，**必填**（NAT 后填端口映射后的公网地址） |
| 公网 IPv6 | 可选 |
| 时区 | 默认 `Asia/Shanghai` |
| ZeroTier 端口 | 宿主机 UDP 端口，默认 9994 |
| 管理界面端口 | 宿主机 TCP 端口，默认 3443（HTTPS） |
| 文件服务器端口 | 宿主机 TCP 端口，默认 3000（HTTPS，需密钥） |

应用数据放在 1Panel 应用目录下的 `data/`（`config`、`dist`、`one` 三个子目录），
升级应用容器不会丢数据。首次登录密码：

```bash
# 在面板里打开应用「终端」
cat /app/config/admin-password
# 或在宿主机上查找（路径随 1Panel 安装位置不同）
sudo find /opt/1panel/apps -maxdepth 6 -name admin-password
```

> 1Panel **社区版**的应用商店只扫描 `/opt/1panel/resource/apps/local/`；**专业版**的
> 「自定义应用仓库」同样可以指向本仓库的 `1panel/apps` 目录。
> 应用包里的镜像 tag 固定为 `2.4.3`（不带 `v`、不用 `latest`），这样面板才能正确识别版本更新。

#### 计划任务：自动跟进最新版本

`scripts/1panel-scheduled-update.sh` 参考 [okxlin/appstore](https://github.com/okxlin/appstore)
的分发方式，把应用包同步进 `/opt/1panel/resource/apps/local/`，面板刷新后就能看到新版本。
两种取源可选：

| `--source` | 从哪里取包 | 说明 |
| --- | --- | --- |
| `release`（默认） | Release 附件 `1panel-app-<tag>.tar.gz` | 用 `SHA256SUMS` 校验，版本确定、可复现 |
| `branch` | 仓库分支 tarball 里的 `1panel/apps/zerotier-planet` | 与 okxlin 的 `localApps` 分支同一思路，始终跟仓库最新 |

```bash
# 先看会做什么（两种取源都支持 --dry-run）
sudo ./scripts/1panel-scheduled-update.sh --dry-run
sudo ./scripts/1panel-scheduled-update.sh --source branch --dry-run

# 默认：从最新 Release 更新应用包，并重启已安装实例
sudo ./scripts/1panel-scheduled-update.sh

# okxlin 风格：直接跟 main 分支
sudo ./scripts/1panel-scheduled-update.sh --source branch --branch main

# 国内网络：给 GitHub 地址加镜像前缀
sudo ./scripts/1panel-scheduled-update.sh --source branch --mirror https://ghproxy.net/

# 只更新应用包，不动运行中的容器；或固定到某个版本
sudo ./scripts/1panel-scheduled-update.sh --no-restart
sudo ./scripts/1panel-scheduled-update.sh --tag v2.4.3
```

在面板里配置：**计划任务 → 创建计划任务 → 任务类型 `Shell 脚本`**，执行周期按需
（例如每天 04:00），脚本内容填：

```bash
/path/to/zerotier-planet-2.0/scripts/1panel-scheduled-update.sh --quiet
```

没 clone 仓库也能挂，一行搞定（脚本自己下载）：

```bash
curl -fsSL https://raw.githubusercontent.com/ban-sky/zerotier-planet-2.0/main/scripts/1panel-scheduled-update.sh -o /tmp/ztp-1panel-update.sh && bash /tmp/ztp-1panel-update.sh --quiet
```

脚本做的事：确定版本（Release tag，或分支里最新的版本目录）→ 与本地
`.../apps/local/zerotier-planet/<版本>` 比较 → 取包（Release 走 `SHA256SUMS` 校验，分支
走 tarball）→ 备份旧包后替换（保留最近 5 个备份）→ 把已安装实例的 compose 镜像 tag 指向
新版本并 `docker compose pull && up -d`（失败退出非 0，面板能在任务日志里看到）。
`--quiet` 适合 cron，只输出告警和错误；`GITHUB_TOKEN` 可提高 GitHub API 限额，
`GITHUB_MIRROR` 环境变量等价于 `--mirror`。脚本本身也随每个 Release 作为附件发布。

### 界面语言

管理界面内置 **简体中文** 与英文，默认 `zh-CN`（跟随浏览器 `Accept-Language`，也可用
`DEFAULT_LOCALE=en` 改默认值）。右上角可以随时切换，选择保存在 `lang` cookie 里；
切换链接是普通的 `/lang/zh-CN` 与 `/lang/en`，不需要 JavaScript。

### 首次登录

```bash
sudo cat data/config/admin-password
```

打开 `https://<公网IP>:3443`，浏览器会提示自签证书，确认后使用
`admin` + 上述密码登录。系统会立即要求设置新密码；改密成功后
`admin-password` 文件会被删除。

### 分发 planet

最安全、最简单的方式是直接从宿主机复制（不需要下载密钥）：

```bash
cp data/dist/planet ./planet
```

或通过文件服务器下载（密钥在 `data/config/file_server.key`）：

```bash
curl -fsS \
  -H "Authorization: Bearer $(sudo cat data/config/file_server.key)" \
  https://<公网IP>:3000/planet -o planet
```

把 `planet` 放到客户端的数据目录并重启 ZeroTier：

| 系统 | 路径 |
| --- | --- |
| Linux | `/var/lib/zerotier-one/planet` |
| Windows | `C:\ProgramData\ZeroTier\One\planet` |
| macOS | `/Library/Application Support/ZeroTier/One/planet` |
| Android/iOS | 使用支持自定义 planet 的客户端导入 |

重启后执行 `zerotier-cli listpeers`，应能看到你的 planet 节点，而不是官方 planet。

### 使用 moon（可选）

`data/dist/` 下同时生成 `<moon-id>.moon`。将 moon 文件复制到客户端的
`moons.d/`，然后：

```bash
zerotier-cli orbit <moon-id> <moon-id>
```

### 创建网络并加入

1. 在 ztncui 的 **Networks → Add network** 创建网络，记下 16 位 network ID。
2. 客户端执行 `zerotier-cli join <network-id>`。
3. 回到 ztncui 勾选成员授权（Auth），必要时设置 IP、路由、规则。
4. 客户端 `zerotier-cli listnetworks` 应为 `OK PRIVATE`。

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `IP_ADDR4` | 自动探测内网 IPv4 | **必须设为客户端可达的公网 IPv4 或域名**；写入 moon/planet |
| `IP_ADDR6` | 空 | 可选公网 IPv6 |
| `ZT_PORT` | `9994` | ZeroTier UDP 端口（容器内固定 9994） |
| `API_PORT` | `3443` | ztncui HTTPS 端口（容器内固定 3443） |
| `FILE_SERVER_PORT` | `3000` | planet 下载端口（容器内固定 3000） |
| `TLS_ENABLED` | `1` | `0` 关闭 TLS（**不推荐**，凭据会明文传输） |
| `TLS_CERT` / `TLS_KEY` | 自签证书 | 挂载自有证书的容器内路径 |
| `FILE_KEY` | 自动生成 | 至少 32 字符；设置后覆盖 key 文件 |
| `ALLOW_QUERY_KEY` | `0` | 允许旧的 `?key=` 下载方式 |
| `REGENERATE_PLANET` | `1` | 每次启动重新生成 planet（身份不变） |
| `APP_UID` / `APP_GID` | `1000` | 运行服务的 uid/gid |
| `HTTPS_HOST` | `0.0.0.0` | 设为 `::` 可同时监听 IPv6 |
| `DEFAULT_LOCALE` | `zh-CN` | 界面默认语言，可选 `zh-CN` / `en` |
| `ALLOWED_ORIGINS` | 空 | 额外允许的表单来源，逗号分隔，如 `https://zt.example.com` |
| `TRUST_PROXY` | 空 | 反向代理层数，如 `1`；启用后信任 `X-Forwarded-For` 与 `X-Forwarded-Host` |

端口通过 `docker run -p` / Compose 映射；容器内部端口固定，便于文档与健康检查。

### 反向代理与来源校验

管理界面只接受同源的表单提交（`POST`/`PUT`/`PATCH`/`DELETE`）。校验比较的是**主机名**，
并会在以下情况自动信任代理转发的 Host：

- 请求来自回环地址或私有网段（容器网络、同机反代都是这种情况）；
- 或显式设置了 `TRUST_PROXY`。

因此 Nginx/Caddy/1Panel 反代重写 `Host` 时不会再出现 `Bad request origin`。若公网域名
从未到达容器（例如外层 CDN 直连），用 `ALLOWED_ORIGINS` 显式列出该来源即可。

### 使用自有证书

```bash
mkdir -p data/config/tls
cp fullchain.pem data/config/tls/fullchain.pem
cp privkey.pem   data/config/tls/privkey.pem
docker compose restart
```

证书需包含 `IP:<公网IP>` 或客户端使用的域名 SAN。若用 Nginx/Caddy 反代，
建议只暴露反代端口，并设置 `TRUST_PROXY=1`；此时可把 `API_PORT`/`FILE_SERVER_PORT`
映射到 `127.0.0.1`。

### 数据与备份

| 路径 | 内容 |
| --- | --- |
| `data/one/` | ZeroTier 身份、controller 数据库、authtoken、moon |
| `data/config/` | ztncui 密码库、session secret、TLS 证书、下载密钥、初始密码 |
| `data/dist/` | 可公开分发的 `planet` 与 `.moon` |

**`data/one/identity.secret` 是 planet 的根身份**，丢失后所有客户端必须更换 planet；
请离线备份 `data/one/` 与 `data/config/`（其中含密钥，注意加密保存）。
升级镜像不会修改这些卷。

## 从上游版本迁移

如果当前运行的是 `xubiaolin/docker-zerotier-planet`，可以直接用迁移脚本升级到本分支。
脚本会保留 ZeroTier 身份、controller 数据库、authtoken、planet/moon 与 ztncui 账户，
并在新容器健康后才会删除旧容器；失败会自动恢复备份并重新启动旧容器。

```bash
# 先查看计划，不做任何修改
sudo ./scripts/migrate-from-upstream.sh --dry-run

# 正式迁移（默认容器名 myztplanet，自动从容器挂载推断数据目录）
sudo ./scripts/migrate-from-upstream.sh

# 容器名或数据目录不是默认值时
sudo ./scripts/migrate-from-upstream.sh --name myztplanet --data /path/to/data/zerotier

# 旧数据在 /root，新仓库在 /opt，并希望把数据也搬到新目录
sudo ./scripts/migrate-from-upstream.sh \
  --data /root/zerotier-planet-2.0/data/zerotier \
  --target-data /opt/zerotier-planet-2.0/data/zerotier
```

`--target-data` 会把旧 `config`、`dist`、`one` 复制到新目录，并让新容器使用新目录；
旧数据保持不动，确认新部署正常后再手工归档或删除。目标目录必须不存在或为空。

脚本会：
- 备份整个数据目录到 `backups/upstream-migration-<时间>.tar.gz`；
- 复用旧 `one/`（identity、controller.d、moons.d、authtoken.secret）；
- 把旧 `ztncui/src/etc/passwd` 复制为 `config/ztncui-passwd`，保留管理员；
- 迁移 ztncui 的成员显示名（`node-persist` storage）；
- 用当前分支构建镜像，启动临时容器，健康检查通过后替换旧容器；
- 保留旧 `config/file_server.key`（若长度足够），并重新生成 planet。

迁移后注意：
- 新 UI 默认使用 HTTPS 自签证书，旧 `http://` 地址不再可用；
- 文件下载改为 Header 认证，旧 `?key=` 默认被禁用；
- planet ID 不变，但 planet 内容会重建；若公网 IP 未变，客户端重新下载 planet 即可；
- 旧容器定义保存在 `backups/*-container.json`，备份可用于手工回滚。

新部署仍只需要三个卷：`config`、`dist`、`one`。旧布局里的 `ztncui` 目录不再挂载；
挂载 `/app/ztncui` 会覆盖不可变应用目录，阻止安全更新生效。

## 本地构建与测试

构建使用固定 digest 的 Debian bookworm-slim 与 Node.js 24 LTS slim 基础镜像；
升级基础镜像时修改 `Dockerfile` 顶部 ARG 并重新跑一遍测试。

apt 默认走中科大镜像（`APT_MIRROR=http://mirrors.ustc.edu.cn`），避免国内构建卡在
`deb.debian.org`。海外或使用其他镜像时可覆盖：

```bash
APT_MIRROR=http://deb.debian.org ./build.sh
```

Git clone 默认经 `https://ghfast.top/https://github.com` 代理，失败会自动回退到
`https://github.com`。镜像只是传输通道，ZeroTier 与 ztncui 仍按固定 SHA 校验；
不要使用无法访问 GitHub 且不提供 fallback 的代理。海外或改用其他代理：

```bash
GH_MIRROR=https://github.com ./build.sh
# 或
GH_MIRROR=https://gh-proxy.com/https://github.com ./build.sh
```

ZeroTier 的 `1.16.2` 同时存在同名 branch 与 annotated tag。构建脚本显式 fetch
tag 并校验 commit，避免误检出 branch tip。

构建默认 `BUILD_JOBS=1`，且 ui-builder 会等 zt-builder 完成后再开始，避免小内存
VPS 在两个 stage 同时跑 apt/npm 和 C++ 编译。内存小于 2 GiB 时建议先加 2–4 GiB
swap；内存 ≥4 GiB 可适当提高并发：

```bash
# 默认单线程编译，最省内存
./build.sh

# 内存充足时提高编译并发
BUILD_JOBS=2 ./build.sh
```

多架构构建（`PUSH=1`）会为 amd64 和 arm64 各跑一次编译，峰值内存约为单架构的两倍；
内存紧张时只构建当前架构，或在不同机器上分别构建。

```bash
# 本地单架构构建
./build.sh

# 多架构构建并推送（需先 docker login）
PUSH=1 IMAGE=ghcr.io/ban-sky/zerotier-planet:latest ./build.sh

# 测试
cd patch/ztncui && npm ci --omit=dev --ignore-scripts
cd ../..
./tests/http-server.test.sh
node tests/ztncui-views.test.js
node tests/origin.test.js
```

仓库提供 `tests/http-server.test.sh`（文件服务器安全回归）、`tests/ztncui-views.test.js`
（全部 Pug 视图编译）与 `tests/origin.test.js`（来源校验 / 反代场景，18 项断言）。

### GitHub Actions 构建与发布

仓库内置两个工作流（都在 `.github/workflows/`，随仓库提交，无需手工创建）：

| 工作流 | 触发条件 | 作用 |
| --- | --- | --- |
| `image-build.yml` | 推送到 `main`、改动 `Dockerfile`/`patch/`，或手动运行 | 构建镜像推送到 GHCR（`latest`、`sha-<commit>`） |
| `release.yml` | 推送 `v*` 标签，或手动运行并填写版本号 | 构建镜像 + 冒烟测试 + 打包 `docker save` 归档 + 发布到 Releases |

#### 发布一个版本

```bash
git tag -a v2.4.3 -m "zerotier-planet-2.0"
git push origin v2.4.3
```

推送标签后，Actions 会依次执行：

1. **prepare** —— 规范化版本号；
2. **build** —— 在原生 runner 上构建 `linux/amd64`；勾选 `include_arm64` 时同时在
   `ubuntu-24.04-arm` 上构建 `linux/arm64`（原生 ARM，不走模拟）；
3. **smoke** —— 真正启动 amd64 镜像并验证：planet 与 moon 已生成（对应 issue #213）、
   控制器 UI 走 HTTPS 且返回登录页、文件服务器未授权返回 401、`?key=` 默认失效、
   路径穿越返回 404、随机密码写在 0600 文件且没有泄漏进容器日志；
4. **release** —— 生成 `SHA256SUMS` 与 `SOURCE`（记录两个上游的精确 commit），
   打包 1Panel 应用（`1panel-app-<版本>.tar.gz`），创建 GitHub Release 并附加归档文件，
   同时把两个架构合成一个多架构 manifest 推到 GHCR。

Release 附件：

```text
zerotier-planet-2.0-2.4.3-amd64.tar.gz    # docker save 归档（gzip）
zerotier-planet-2.0-2.4.3-arm64.tar.gz    # 仅当勾选 include_arm64
1panel-app-2.4.3.tar.gz                          # 1Panel 本地应用包
1panel-scheduled-update.sh                          # 计划任务：自动更新应用包
SHA256SUMS                                       # 每个归档的校验和
SOURCE                                           # 上游 commit 与构建参数
LOAD-amd64-2.4.3.txt                            # 加载与运行说明
```

在服务器上使用归档（无需自己编译、无需 registry 登录）：

```bash
docker load < zerotier-planet-2.0-2.4.3-amd64.tar.gz
docker images | grep zerotier-planet-2.0
```

归档里保存的 tag 是 `docker.io/lonelyx/zerotier-planet:2.4.3`，可以直接用
`docker-compose.yml` 里的 `image:` 字段引用（换一台机器时也可以 `docker tag` 成同一个名字）。

### 镜像地址

每次发布都会同时推送到 **GHCR** 与 **Docker Hub**，两边内容完全一致（同一个多架构
manifest，`linux/amd64` + `linux/arm64`），都是**公开**的，`docker pull` 不需要登录：

| Registry | 地址 | 说明 |
| --- | --- | --- |
| Docker Hub | `docker.io/lonelyx/zerotier-planet` | **默认**，脚本、Compose 与 1Panel 应用包都用它 |
| GHCR（GitHub） | `ghcr.io/ban-sky/zerotier-planet` | 备选，内容与 Docker Hub 完全相同 |

```bash
# 默认：Docker Hub
docker pull docker.io/lonelyx/zerotier-planet:2.4.3

# 备选：GHCR（拉不动 Docker Hub 时用）
docker pull ghcr.io/ban-sky/zerotier-planet:2.4.3
```

tag 含义（两个 registry 相同）。**GitHub Release 与 git tag 带 `v`（`v2.4.3`），镜像 tag 不带 `v`（`2.4.3`）。**



| tag | 内容 | 何时更新 |
| --- | --- | --- |
| `2.4.3` | 该版本发布时的多架构镜像 | 打 `v*` tag 或手动 dispatch Release |
| `latest` | 最近一次发布 | 同上 |
| `sha-<commit>` | 某个 `main` 提交的构建 | push 到 `main` 且改动 `Dockerfile` / `patch/**` |

当前 `2.4.3` 的 manifest（两边一致）：

```text
MediaType: application/vnd.oci.image.index.v1+json
Digest:    sha256:0741aa3d4fb589df26762a25ee79a8006823675a0a66053993c547a795ff4b53
  linux/amd64  -> sha256:a34ae6639067f797e2d3e326ab7723d7accb299a2d6f375aa71063d81a68ce1e
  linux/arm64  -> sha256:336cab47510aa655f2f3be47bb49506b350ced4287c5f38671f248e7db91e529
```

> GHCR 包继承仓库可见性，本仓库为 public；Docker Hub 仓库也是 public。
> 若 fork 后把仓库改成私有，GHCR 包会一起变私有，此时二选一：

```bash
# 方式 A：把 package 设为 public（GitHub → Packages → Package settings → Visibility）

# 方式 B：用有 read:packages 权限的 PAT 登录
echo "$CR_PAT" | docker login ghcr.io -u ban-sky --password-stdin
```

> Docker Hub 免费账号有拉取限流：匿名 100 次 / 6 小时，登录后 200 次 / 6 小时。
> 生产机上 `docker login` 可以避免共享 IP 被限流。

拉取并部署（默认走 Docker Hub，镜像与 GHCR 完全相同）：

```bash
# 默认：Docker Hub
docker pull docker.io/lonelyx/zerotier-planet:2.4.3

sudo IMAGE=docker.io/lonelyx/zerotier-planet:2.4.3 \
  PULL=1 ./deploy.sh --pull --name myztplanet --data ./data/zerotier

# 备选：GHCR
sudo IMAGE=ghcr.io/ban-sky/zerotier-planet:2.4.3 \
  PULL=1 ./deploy.sh --pull --name myztplanet --data ./data/zerotier
```

从旧部署迁移时直接拉取工作流镜像，不在服务器上编译：

```bash
sudo ./scripts/migrate-from-upstream.sh \
  --pull \
  --image docker.io/lonelyx/zerotier-planet:2.4.3 \
  --target-data /opt/zerotier-planet-2.0/data/zerotier
```

工作流只在 GitHub 托管 runner 上编译；服务器只负责 `docker load`/`docker pull` 和运行。

#### Docker Hub 同步是怎么做的

同步不是重新构建：`image-build` 与 `release` 各有一个步骤，用
`docker buildx imagetools create` 直接复制 manifest（含两个架构），所以 Docker Hub 与
GHCR 是同一份镜像、同一个 digest。复制前先用 `docker/login-action` 登录，
`release` 里对 `<版本>` 与 `latest` 各复制一次。

fork 之后想开同样的行为，配置三步：

1. 在 Docker Hub 建仓库 `zerotier-planet-2.0`（不必手动初始化，首次 push 自动创建）；
2. Docker Hub → **Account settings → Security → New access token**，权限选 **Read & Write**；
3. 仓库 **Settings → Secrets and variables → Actions** 新增两个 repository secret：
   - `DOCKERHUB_USERNAME`：Docker Hub 用户名（决定镜像命名空间）
   - `DOCKERHUB_TOKEN`：上一步的 access token（**不要**用登录密码）

没有这两个 secret 时，镜像步骤自动 `skipped`，只推 GHCR，其余流程不受影响。
镜像名只写在两个 workflow 的 `dst="docker.io/${DOCKERHUB_USERNAME}/zerotier-planet-2.0"`
一处，改名字只改这里。

### 升级上游版本

`scripts/upgrade-upstreams.sh` 用来检查并升级两个上游依赖，只修改 `Dockerfile`
顶部的 `ZT_VERSION`、`ZT_COMMIT` 与 `ZTNCUI_COMMIT`，不会合并
xubiaolin/docker-zerotier-planet（本分支已大幅重构），也不会自动提交：

```bash
# 只检查，不改文件（默认）
./scripts/upgrade-upstreams.sh

# 更新 Dockerfile 并跑本地回归测试；测试失败会自动恢复 Dockerfile
./scripts/upgrade-upstreams.sh --apply

# 只升级 ZeroTier / 只升级 ztncui
./scripts/upgrade-upstreams.sh --apply --zerotier-only
./scripts/upgrade-upstreams.sh --apply --ztncui-only

# 更新后直接构建（需要本机 docker）
./scripts/upgrade-upstreams.sh --apply --build
```

脚本依赖 `curl`、`git`、`node`（`--build` 另需 docker）；GitHub API 有匿名限流时可传 `GITHUB_TOKEN`。升级 ZeroTier 后应查看 release
notes 并重点验证 controller API；升级 ztncui 后应重新检查 `patch/ztncui` 的
controller/view 覆盖是否仍兼容。README/SECURITY 中的版本号与变更说明需要手动同步。

## 安全模型与限制

- 这是**单节点** controller，不提供 HA；controller 数据库就是 `data/one/controller.d`。
- 会话保存在内存中，容器重启后需要重新登录（不会持久化会话密钥到浏览器）。
- 自签证书只提供传输加密，不提供身份认证；生产环境建议使用受信任证书或反代。
- 管理界面应只对可信网络开放；不要直接把 3443 暴露到整个互联网而不设强密码。
- 容器内没有 `NET_ADMIN` 时 ZeroTier 不能创建 TUN，但 controller/planet 功能正常；
  仅当你要让容器本身作为 leaf 加入网络时才需要额外 capability。
- 本镜像的 controller 受 ZeroTier 非商业许可证约束；商业使用请购买授权或改用官方 controller。
- 本项目不托管任何中继/根服务器；planet 的可用性取决于你的主机与网络。

## 故障排查

- **客户端仍连官方 planet**：确认 planet 文件路径正确并已重启服务；`zerotier-cli listpeers`
  中应出现你的公网 IP；检查 UDP 9994 是否被防火墙/NAT 阻断。
- **管理界面 401/无法登录**：确认 `data/config/admin-password` 是否存在；删除
  `data/config/ztncui-passwd` 与 `admin-password` 后重启可重置（会丢失已建管理员）。
- **容器反复重启**：`docker logs <容器名>`；常见原因是公网 IP 未设置、端口占用、
  卷权限不是 uid 1000，或证书不可读。
- **浏览器证书错误**：自签证书属预期；导入证书或改用受信任证书。
- **登录时提示 `Bad request origin`**：2.1.0 及更早的来源校验过于严格，2.2.0 已修复。
  若仍出现，说明请求来源与 `Host`/`X-Forwarded-Host` 都不同：把反代设为传递
  `Host $host`（并加 `X-Forwarded-Host $host`），或把域名写进 `ALLOWED_ORIGINS`，
  容器日志里会打印 `rejected ... origin=... candidates=...` 便于定位。
- **提示「请求来源校验失败」，日志里是 `origin=null`**：浏览器发的是不透明来源
  （`Origin: null`，常见于微信/QQ/UC 等内置浏览器、沙箱 iframe、`file://` 页面）。
  2.3.0 及更早把它当成无法解析而拒绝；2.3.1 起改为先退到 `Referer`，再按「未发送
  Origin」放行。暂时不能升级时，换 Chrome/Edge 等常规浏览器登录即可。
- **下载 401**：使用 `Authorization: Bearer <key>`，不要再用 `?key=`；或直接从
  `data/dist/planet` 复制。

## 许可证

- 本项目原创代码：GPL-3.0-only，见 [LICENSE](LICENSE)。
- ztncui：GPL-3.0，见其仓库。
- ZeroTier One 核心：MPL-2.0；`nonfree/controller`：ZeroTier SOURCE-AVAILABLE
  LICENSE（仅非商业），见 [NOTICE](NOTICE)。

上游项目：<https://github.com/xubiaolin/docker-zerotier-planet>
