# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，镜像 tag 与 Release 标签一致。

## [2.4.1] - 2026-11-13

### 变更

- **1Panel 应用图标改用 ZeroTier 官方品牌样式**：琥珀色（`#FFB25B`）底配深藏青
  （`#161C24`）字形——顶部横梁、立柱、轨道环、圆头尾柱。几何比例取自官方品牌图，
  重新绘制为 512×512（4× 超采样）PNG，底色圆角 96px，并按视觉中心整体上移 10px。

### 文档

- README（中/英）版本引用更新为 `v2.4.1`，`CHANGELOG` 增补本节。

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

- `ghcr.io/ban-sky/docker-zerotier-planet-2.0:v2.3.0`（发布时同时打 `latest`）
- `docker.io/lonelyx/docker-zerotier-planet-2.0:v2.3.0`（发布时同时打 `latest`）

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

- `ghcr.io/ban-sky/docker-zerotier-planet-2.0:v2.2.0`（发布时同时打 `latest`）
- `docker.io/lonelyx/docker-zerotier-planet-2.0:v2.2.0`（发布时同时打 `latest`）

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
  Docker Hub。本仓库已启用，镜像地址 `docker.io/lonelyx/docker-zerotier-planet-2.0`，
  与 GHCR 逐层一致；未配置 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` 时自动跳过。

### 镜像

- `ghcr.io/ban-sky/docker-zerotier-planet-2.0:v2.1.0`（发布时同时打 `latest`）
- `docker.io/lonelyx/docker-zerotier-planet-2.0:v2.1.0`（发布时同时打 `latest`）
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
