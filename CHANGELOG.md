# 更新日志

镜像 tag 与 Release 标签一致：git tag / Release 带 `v`（如 `v2.0.0`），镜像 tag 不带（如 `2.0.0`）。

## 版本号规则

从 2.0.0 起重编，格式为 `2.<功能>.<修复>`：

- **首位 `2`**：本仓库是 `docker-zerotier-planet` 的 2.0 维护分支，固定不变；
- **中间位**：功能更新（新增能力、行为变更，如 `2.1.0`）；
- **末位**：小版本与 bug 修复（如 `2.0.1`）。

> 2.0.0 之前的构建曾用 `2.1.0`–`2.6.0` 编号，已统一重编：那些内容全部并入本 2.0.0，
> 对应的旧 Release 与 tag 已删除，不再提供下载。

## [2.0.1] - 2026-11-14

小版本：文档整理 + 镜像按新版本号重建，功能无变化。

### 文档

- README 顶部新增「三步跑起来」：一条 `docker run`、访问地址、初始密码位置。
- 目录上移到显著位置；1Panel 应用商店文档重写为「快速信息 / 功能 / 安装 / 初始密码 /
  自动更新 / 端口 / 常见问题」，字段表与端口表并列，常见问题覆盖登录、证书、密码与更新。
- 补回被合并掉的旧编号更新日志（见文末「历史版本」），只保留主要条目。

### 镜像

- 按 `2.0.1` 重新构建并发布：`docker.io/lonelyx/zerotier-planet:2.0.1` 与
  `ghcr.io/ban-sky/zerotier-planet:2.0.1`（内容相同，多架构）。

## [2.0.0] - 2026-11-14

首个按新编号发布的版本，包含此前所有改进。

### 内核与供应链

- ZeroTier One 升级到 **1.16.2**（`fc5c3ec2…`），修正上游最新版删除 `attic/world` 导致
  打包失败的问题（issue #213）：planet 生成工具改为独立实现，不再依赖该目录。
- ztncui 固定到提交 `1b228486…`（不再从 HEAD 克隆，issue #215 的供应链问题）；
  基础镜像按 digest 固定，构建可复现。
- 镜像多架构发布：`linux/amd64` + `linux/arm64`，同时推送 GHCR 与 Docker Hub。

### 安全（对应 issue #215 的五个问题）

- 首次启动生成 24 字符随机管理员密码，写入 `0600` 的 `/app/config/admin-password`，
  首次登录强制改密，改密后文件自动删除（替代默认口令）。
- 文件服务器只允许下载 `planet` 与 `<id>.moon` 白名单文件名，用 `realpath` 校验目录
  归属，路径穿越返回 404。
- 下载密钥改用 `Authorization: Bearer` / `X-Api-Key`，不再放在 URL 查询串里
  （旧的 `?key=` 需显式 `ALLOW_QUERY_KEY=1` 才启用）。
- 管理界面与文件服务器默认 HTTPS（自签 ECDSA P-256，TLS 1.2+）+ HSTS。
- 补充 `SECURITY.md`，声明漏洞报告流程。

### 加固

- `set -Eeuo pipefail` + `umask 077`，日志不再打印令牌；ztncui 与文件服务器降权到
  uid/gid 1000 运行。
- 会话存储改为有界实现（解决 issue #185 的 MemoryStore 重启循环）；CSP 禁止内联脚本，
  POST 校验来源，登录按 IP 限流，请求体限制 256 KB，错误页不泄露堆栈。
- 修复反代场景下的 `Bad request origin`：来源校验兼容 `X-Forwarded-Host` / `Forwarded`，
  端口差异不再误判，并接受浏览器的不透明来源 `Origin: null`（微信/QQ 等内置浏览器）。

### 功能

- **简体中文界面**（默认中文，右上角切换中/英），26 个视图全部双语。
- **登录两步验证（TOTP，RFC 6238）**：每账号独立开关，一次性显示 10 个备用码，
  按时间步防重放，关闭需密码 + 有效代码。
- **通行密钥（Passkey / WebAuthn）**：与 TOTP 二选一，浏览器用指纹/面容/系统 PIN 确认；
  挑战存会话、5 分钟过期、单次使用，凭据记录签名计数器拒绝重放。
  要求域名 + 受信任证书，裸 IP 下界面会说明原因并提示 `PASSKEY_RP_ID` / `PASSKEY_ORIGIN`。
- **1Panel 应用商店**：本地应用包（`1panel/apps/zerotier-planet/`）、官方品牌图标、
  一键安装脚本 `scripts/install-1panel-app.sh` 与计划任务更新脚本
  `scripts/1panel-scheduled-update.sh`。
- 更新脚本支持四种取源：`release`（Release 资产 + `SHA256SUMS` 校验）、`cdn`
  （jsDelivr 逐文件拼装）、`branch`（仓库 tarball）、`dir`（本地目录），
  默认 `auto` 先走 Release 再回落 CDN；可用 `--mirror` 走加速镜像，
  国内服务器不再卡在 `api.github.com` 上反复重试。
- 界面按 2.0 风格重做：卡片式布局、深浅对比、移动端可用；图标沿用 ZeroTier 官方品牌标识。

### 镜像

| Registry | 地址 |
| --- | --- |
| Docker Hub（默认） | `docker.io/lonelyx/zerotier-planet:2.0.0` |
| GHCR | `ghcr.io/ban-sky/zerotier-planet:2.0.0` |

### 文档

- 中英双语 README 覆盖三种部署方式（脚本 / Compose / 1Panel）、反向代理、语言切换、
  两步验证与通行密钥、计划任务、故障排查与镜像地址说明。
- 新增界面截图（`docs/screenshots/`）、`CONTRIBUTING.md`、`NOTICE`。

## 历史版本（旧编号）

2.0.0 之前曾用 `2.1.0`–`2.6.0` 编号，内容都已并入 2.0.0；为便于查阅，按主要变更简记如下。

| 版本 | 主要变更 |
| --- | --- |
| 2.6.0 | 通行密钥（Passkey / WebAuthn），与两步验证二选一 |
| 2.5.0 | 登录两步验证（TOTP），含一次性备用码与防重放 |
| 2.4.5 | 更新脚本四级取源（release / cdn / branch / dir），国内服务器不再卡在 API |
| 2.4.4 | 文档置顶「一键更新应用商店包」命令 |
| 2.4.3 | 默认镜像改为 Docker Hub |
| 2.4.2 | 仓库更名 `zerotier-planet-2.0`、镜像 tag 去掉 `v`、品牌图标进入界面、初始密码说明移入 1Panel 文档 |
| 2.4.1 | 1Panel 图标改为 ZeroTier 官方品牌造型 |
| 2.4.0 | 界面瘦身（登录页与概览去掉冗余文案） |
| 2.3.1 | 修复内置浏览器（`Origin: null`）无法登录 |
| 2.3.0 | 计划任务脚本支持 release / branch 双取源与 `--mirror` |
| 2.2.0 | 修复 `Bad request origin`；界面支持简体中文；新增 1Panel 计划任务脚本 |
| 2.1.0 | 新增 1Panel 应用商店包、安装脚本与 Release 附件 |
