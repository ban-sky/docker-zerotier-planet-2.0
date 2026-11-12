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

### 文档

- README（中/英）新增「目录」、三种部署方式对比表，以及「方式三：1Panel 应用商店」章节。
- 补充 1Panel 安装表单字段说明、数据目录位置、初始密码获取方式，以及
  社区版（本地应用目录）与专业版（自定义应用仓库）的区别。
- 版本号统一到 v2.1.0，文档中的镜像 tag、Release 附件名同步更新。

## [2.0.0] - 2026-11-12

首个 2.0 版本：

- ZeroTier One 升级到 **1.16.2**；因上游删除 `attic/world`，按 `node/World.hpp` 与 `ECC`
  API 重写 `mkworld`，修复 issue #213。
- 按 issue #215 修复五项安全问题：随机管理员密码并强制改密、文件服务器路径穿越、
  下载密钥不再放 URL、依赖锁定到 commit、默认 TLS。
- ztncui 重做为 0.9.0：响应式界面、移除 Bootstrap 3/jQuery、CSP 只允许 `'self'`。
- GitHub Actions 构建多架构镜像并发布到 GHCR 与 Release（amd64 / arm64）。
