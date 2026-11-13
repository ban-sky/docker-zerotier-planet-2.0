# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，镜像 tag 与 Release 标签一致。

## [2.5.0] - 2026-11-13

### 新增

- **登录两步验证（TOTP，RFC 6238）**：每个管理员可以给自己的账号单独开启，登录时密码之外
  还要输入验证器里的 6 位动态码。密码正确只进入 `/login/2fa`，验证通过才建立会话。
- 绑定页给出 32 字符密钥与 `otpauth://` 链接，手动录入任意 TOTP 应用；绑定成功后一次性
  显示 10 个备用码（`XXXX-XXXX`，SHA-256 存储，用一次即作废）。
- 防重放：按账号记录 `lastStep`，同一 30 秒窗口内的动态码不能被再次使用。
- 关闭两步验证需要**当前密码 + 一次有效代码**，仅拿到会话无法关闭。
- 新增 `TOTP_ISSUER` 环境变量（默认 `ZeroTier Planet`），控制验证器里显示的发行方名称。
- 新增 `patch/ztncui/totp.js`（零依赖，仅用 node 内置 `crypto`）与 `tests/totp.test.js`
  （RFC 6238 附录 B 全部 SHA-1 测试向量）。
- 新增 `1panel/apps/zerotier-planet/2.5.0/`（镜像 `docker.io/lonelyx/zerotier-planet:2.5.0`）。

### 变更

- `build.sh`、`deploy.sh`、`docker-compose.yml`、`scripts/migrate-from-upstream.sh` 的默认镜像
  版本推进到 `2.5.0`。
- README（中/英）新增「两步验证（TOTP）」章节，环境变量表补 `TOTP_ISSUER`；1Panel 应用文档
  的功能列表标注两步验证。
- CI 冒烟新增两步验证用例：跑单元测试、开启 TOTP、确认登录被 `/login/2fa` 拦截、动态码与
  错误码的放行/拒绝行为。

## [2.4.5] - 2026-11-13

### 修复

- **国内服务器执行 1Panel 更新脚本时「一直重试」**：旧脚本对不可达主机使用
  `--retry 3 --connect-timeout 15`，且取版本强依赖被屏蔽的 `api.github.com`，请求会一路
  重试到超时。现在每个请求 `--connect-timeout 8 --max-time 180 --retry 1`，失败立刻换通道。
- 取最新版本改为三级回退：`releases/latest` 的 302 跳转（可用镜像代理）→ GitHub API
  （可带 `GITHUB_TOKEN`、可走镜像）→ `data.jsdelivr.com` 元数据。

### 新增

- `--source auto|release|cdn|branch|dir`：`auto`（默认）先试 Release、失败自动改用 jsDelivr；
  `cdn` 只走 jsDelivr（`cdn.jsdelivr.net` 等四个域名）逐个拼装应用包；`dir` 配
  `--from-dir` 支持完全离线安装。
- `--mirror` 可重复，内置 `ghfast.top`、`gh-proxy.com`、`ghproxy.net` 三个镜像；
  只在直连失败后才使用，正常网络不额外等待。
- 新增 `1panel/apps/zerotier-planet/2.4.5/`（镜像 `docker.io/lonelyx/zerotier-planet:2.4.5`）。

### 变更

- `build.sh`、`deploy.sh`、`docker-compose.yml`、`scripts/migrate-from-upstream.sh` 的默认镜像
  版本推进到 `2.4.5`。
- README（中/英）「一键更新」章节新增「国内服务器 / 访问不了 GitHub 时」小节，给出
  `--source cdn`、`--mirror`、`--source dir` 三种写法；1Panel 应用文档同步。
- CI 的 cron 脚本用例改为覆盖 `--source dir`（离线路径）与 `--source branch`（联网路径）。

## [2.4.4] - 2026-11-13

### 新增

- **文档顶部新增「一键更新 1Panel 应用商店包」**：一行 `curl … | sudo bash -s -- --quiet` 直接执行，
  把最新版本同步进 `/opt/1panel/resource/apps/local/`；另给「固定到最新 Release 资产」与
  `--dry-run` 预演两种写法，并说明会自动校验 `SHA256SUMS`、保留最近 5 个备份、重启已装实例。
- 1Panel 应用文档（中/英）的「自动更新」章节同样置顶这条一行命令；Release 正文的 1Panel 段
  也加了一行式更新示例。
- 新增 `1panel/apps/zerotier-planet/2.4.4/`（镜像 `docker.io/lonelyx/zerotier-planet:2.4.4`）。

### 变更

- `build.sh`、`deploy.sh`、`docker-compose.yml`、`scripts/migrate-from-upstream.sh` 的默认镜像
  版本推进到 `2.4.4`。

## [2.4.3] - 2026-11-13

### 变更

- **默认镜像改为 Docker Hub**：`docker-compose.yml`、`deploy.sh`、`build.sh`、
  `scripts/migrate-from-upstream.sh`、`scripts/1panel-scheduled-update.sh` 与 1Panel 应用包
  的默认镜像统一为 `docker.io/lonelyx/zerotier-planet:<版本号>`；GHCR 仍同步发布，作为备选。
- Release 正文的镜像表与「加载并运行」示例改为先列 Docker Hub（未配置 `DOCKERHUB_TOKEN`
  时自动退回 GHCR）。
- 新增 `1panel/apps/zerotier-planet/2.4.3/`（镜像指向 Docker Hub），2.1.0–2.4.2 目录保留。

### 文档

- README（中/英）镜像表改为「Docker Hub 默认 / GHCR 备选」，拉取、部署、迁移示例同步换成
  `docker.io/lonelyx/zerotier-planet:2.4.3`；1Panel 应用文档补充版本与镜像来源说明。

## [2.4.2] - 2026-11-13

### 变更

- **项目更名**：仓库由 `docker-zerotier-planet-2.0` 改为 `zerotier-planet-2.0`；镜像同步改为
  `ghcr.io/ban-sky/zerotier-planet` 与 `lonelyx/zerotier-planet`，镜像 tag 与版本号一致、
  **不带 `v`**（git tag / Release 仍是 `v2.4.2`）。旧仓库地址与旧镜像名继续可用。
- **图标与界面统一使用 ZeroTier 官方品牌标识**：琥珀色 `#FFB25B` + 深藏青 `#161C24` 的
  「横梁 + 轨道环 + 尾柱」字形。1Panel 商店图标、管理界面顶栏与登录页改用同一份
  `/images/zt-mark.svg`（矢量，随尺寸缩放不糊），网页图标（favicon）同步替换。
- **登录页去掉密码来源提示**：页面不再出现 `/app/config/admin-password` 字样；
  取初始密码的说明移到 1Panel 应用文档的「初始密码」一节（终端 `cat`、宿主机 `find`、
  `docker exec` 三种取法，以及忘记密码后的重置方法）。

### 文档

- 1Panel 应用文档（中/英）新增「初始密码」章节，并说明 2.4.2 起的镜像名与旧版本目录的差异。
- README（中/英）顶部增加更名说明，镜像 tag 语义改为「镜像不带 `v`、git tag 带 `v`」。

## [2.4.1] - 2026-11-13

### 变更

- **1Panel 应用图标改用 ZeroTier 官方品牌样式**：琥珀色（`#FFB25B`）底配深藏青
  （`#161C24`）字形——顶部横梁、立柱、轨道环、圆头尾柱。几何比例取自官方品牌图，
  重新绘制为 512×512（4× 超采样）PNG，底色圆角 96px，并按视觉中心整体上移 10px。

### 文档

- README（中/英）版本引用更新为 `v2.4.2`，`CHANGELOG` 增补本节。

## [2.4.0] - 2026-11-13

### 变更

- **登录页与入口页精简**：去掉与顶部品牌重复的 ZT 徽标、多余的眉题（eyebrow）和三条
  卖点列表；登录提示压缩为一行「使用 /app/config/admin-password 中的初始密码登录。」；
  入口页标题改为品牌名 `ZeroTier Planet`，下面只跟一句副标题。
- **概览页瘦身**：两张统计卡片不再显示说明文字，三个快捷入口卡片只保留分类、标题和
  箭头，页面留白更均匀。
- **其余页面文案收敛**：修改密码页副标题缩短为「至少 10 个字符。」；网络属性提示缩短
  为「点击属性即可编辑。」；快速配置、私有网络、IPv4/IPv6 模式、DNS 各页的副标题都压到一行。
- **1Panel 应用商店图标重新设计**：渐变底、偏心行星与轨道环、轨道上的节点，圆角与留白
  按应用商店图标尺寸重新调整。

### 文档

- README（中/英）全部版本引用更新为 `v2.4.0`，`CHANGELOG` 增补本节。

## [2.3.1] - 2026-11-13

### 修复

- **`Origin: null` 导致登录被 403**：部分浏览器（微信/QQ/UC 等内置 WebView、沙箱
  iframe、`file://` 页面）提交表单时发送的是不透明来源 `Origin: null`。旧实现把它
  当成「无法解析的来源」直接拒绝，日志表现为
  `rejected POST /login: origin=null candidates=<你的IP>`，用户只能看到
  「请求来源校验失败」。现在把 `null` 视作「没有可用的来源」：先退到 `Referer`
  校验，`Referer` 也缺失时按未发送 `Origin` 处理放行（会话 cookie 本身是
  `SameSite=Lax`，跨站 POST 不会携带凭据）。
- 无法解析的 `Origin` 同样先尝试 `Referer`，不再立即拒绝。
- `tests/origin.test.js` 增补 5 条用例：`null`/`NULL`、`null` + 同源 `Referer`、
  `null` + 跨站 `Referer`（仍拒绝）、无法解析 + 同源 `Referer`。

### 文档

- README（中/英）故障排查新增 `origin=null` 条目，说明成因与临时绕过方式。

## [2.3.0] - 2026-11-13

### 新增

- **计划任务脚本支持两种取源**，参考 [okxlin/appstore](https://github.com/okxlin/appstore)
  的 `localApps` 分发方式：
  - `--source release`（默认）：从最新 Release 下载 `1panel-app-<tag>.tar.gz` 并用
    `SHA256SUMS` 校验，版本确定、可复现；
  - `--source branch`：下载分支 tarball（默认 `main`），取其中的
    `1panel/apps/zerotier-planet` 同步到 `/opt/1panel/resource/apps/local/`，始终跟仓库最新。
- 新增 `--branch <name>`、`--mirror <prefix>`（等价环境变量 `GITHUB_MIRROR`，适用于
  ghproxy 等国内镜像）、`--keep-downloads`；`--dry-run` 在两种模式下都会报告将要做什么。
- 无需 clone 仓库的一行式 cron 命令：
  `curl -fsSL .../scripts/1panel-scheduled-update.sh -o /tmp/ztp-1panel-update.sh && bash /tmp/ztp-1panel-update.sh --quiet`。
- 新增 1Panel 应用商店版本目录 `1panel/apps/zerotier-planet/2.3.0/`（镜像 tag `v2.3.0`）。

### 文档

- README（中/英）重写「计划任务」章节：两种取源对比表、镜像前缀用法、一行式命令、
  备份与回滚说明；1Panel 应用说明同步更新。

### 镜像

- `ghcr.io/ban-sky/zerotier-planet:v2.3.0`（发布时同时打 `latest`）
- `docker.io/lonelyx/zerotier-planet:v2.3.0`（发布时同时打 `latest`）

## [2.2.0] - 2026-11-12

### 修复

- **登录时报 `Bad request origin`**（2.0.x / 2.1.0 回归）：来源校验原先直接比较
  `Origin` 的 `host:port` 与 `Host` 头，只要反向代理重写了 `Host`、端口做了映射，或浏览器
  省略了默认端口，所有表单提交（包括登录）都会被 403。现在改为比较**主机名**，并在请求
  来自回环/私有网段（容器网络、同机反代）或设置了 `TRUST_PROXY` 时信任
  `X-Forwarded-Host` / `Forwarded: host=`；跨站提交仍然拒绝，同时打印
  `rejected ... origin=... candidates=...` 便于排查。新增 `ALLOWED_ORIGINS` 作为显式白名单，
  新增 `tests/origin.test.js`（18 项）。
- 管理界面 `lang` cookie 与 403 文案统一走新的 i18n 层，不再有硬编码英文。

### 新增

- **简体中文界面**：服务端渲染的全部 26 个视图支持中英双语，默认 `zh-CN`（跟随
  `Accept-Language`，可用 `DEFAULT_LOCALE` 改默认值），顶部提供 `/lang/zh-CN`、`/lang/en`
  普通链接切换，选择持久化在 cookie 中；CSP 仍为 `'self'`，无内联脚本样式。
- `scripts/1panel-scheduled-update.sh`：1Panel **计划任务** 专用更新脚本 —— 查询最新
  Release → 与本地应用包版本比较 → 下载并校验 `SHA256SUMS` → 备份后替换应用包（保留最近
  5 个备份）→ 把已安装实例的 compose 镜像 tag 指向新版本并 `docker compose pull && up -d`。
  支持 `--tag` / `--panel-dir` / `--no-restart` / `--dry-run` / `--quiet`，并作为 Release
  附件发布。
- 新增 1Panel 应用商店版本目录 `1panel/apps/zerotier-planet/2.2.0/`。

### 镜像

- `ghcr.io/ban-sky/zerotier-planet:v2.2.0`（发布时同时打 `latest`）
- `docker.io/lonelyx/zerotier-planet:v2.2.0`（发布时同时打 `latest`）

### 文档

- README（中/英）新增「2.2.0 的修复与新增」「反向代理与来源校验」「界面语言」
  「计划任务：自动跟进最新版本」章节，环境变量表补充 `DEFAULT_LOCALE` / `ALLOWED_ORIGINS`，
  故障排查补充 `Bad request origin` 条目。
- 版本号统一到 v2.2.0，Release 附件清单补充 `1panel-scheduled-update.sh`。

## [2.1.0] - 2026-11-12

### 新增

- **1Panel 应用商店支持**：仓库新增 `1panel/apps/zerotier-planet/` 应用包，可在 1Panel
  里填表安装、可视化启停与升级。镜像 tag 固定为 `v2.1.0`（不使用 `latest`），
  面板才能正确识别版本更新。
- `scripts/install-1panel-app.sh`：把应用包装进 `/opt/1panel/resource/apps/local/`，
  支持 `--download <tag>` 直接从 Releases 取包，无需 clone。
- Release 附件新增 `1panel-app-<版本>.tar.gz`，并纳入 `SHA256SUMS`。
- **Docker Hub 镜像同步**：`image-build` 与 `release` 各增加一步，用
  `docker buildx imagetools create` 直接复制 manifest（不重新构建），把同名 tag 镜像到
  Docker Hub。本仓库已启用，镜像地址 `docker.io/lonelyx/zerotier-planet`，
  与 GHCR 逐层一致；未配置 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` 时自动跳过。

### 镜像

- `ghcr.io/ban-sky/zerotier-planet:v2.1.0`（发布时同时打 `latest`）
- `docker.io/lonelyx/zerotier-planet:v2.1.0`（发布时同时打 `latest`）
- 两个 registry 上的 `v2.1.0` 均为 OCI image index，平台 `linux/amd64` + `linux/arm64`，
  digest `sha256:dd1a860079fc2403639442aae3a650704fd839de8ebe2a25998f76b37414cee8`
  （amd64 子 manifest `sha256:397689b7e33e…`，arm64 子 manifest `sha256:eceb615b702f…`）。

### 文档

- README（中/英）新增「目录」、三种部署方式对比表，以及「方式三：1Panel 应用商店」章节。
- 补充 1Panel 安装表单字段说明、数据目录位置、初始密码获取方式，以及
  社区版（本地应用目录）与专业版（自定义应用仓库）的区别。
- 新增「镜像地址」章节：两个 registry 的地址、tag 语义（版本 / `latest` / `sha-<commit>`）、
  当前 manifest digest、Docker Hub 限流说明，以及 fork 后如何自行启用同步。
- 版本号统一到 v2.1.0，文档中的镜像 tag、Release 附件名同步更新。

## [2.0.0] - 2026-11-12

首个 2.0 版本：

- ZeroTier One 升级到 **1.16.2**；因上游删除 `attic/world`，按 `node/World.hpp` 与 `ECC`
  API 重写 `mkworld`，修复 issue #213。
- 按 issue #215 修复五项安全问题：随机管理员密码并强制改密、文件服务器路径穿越、
  下载密钥不再放 URL、依赖锁定到 commit、默认 TLS。
- ztncui 重做为 0.9.0：响应式界面、移除 Bootstrap 3/jQuery、CSP 只允许 `'self'`。
- GitHub Actions 构建多架构镜像并发布到 GHCR 与 Release（amd64 / arm64）。
