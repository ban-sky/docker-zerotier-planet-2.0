# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，镜像 tag 与 Release 标签一致。

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
