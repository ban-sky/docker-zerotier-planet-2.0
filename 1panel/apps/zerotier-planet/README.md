## 产品介绍

在 Docker 中自建 **ZeroTier planet（行星服务器）** 与 **ztncui 网络控制器**，对应
[docker-zerotier-planet 2.0](https://github.com/ban-sky/zerotier-planet-2.0) 项目。
内置 ZeroTier One 1.16.2，默认开启 TLS 与安全加固项。

## 主要功能

- 自动生成 planet 与 moon 文件，客户端可用自定义 planet 加入你的网络。
- 首次启动生成随机管理员密码，首次登录强制改密，改密后密码文件自动删除。
- 管理界面与文件服务器默认 HTTPS（自签 ECDSA P-256 证书）。
- 管理界面内置简体中文与英文，默认简体中文，右上角可切换。
- 图标与界面使用 ZeroTier 官方品牌标识（琥珀色 `#FFB25B` + 深藏青 `#161C24`）。
- planet 下载走 `Authorization: Bearer` 鉴权，不再把密钥放在 URL 里。
- 数据持久化在应用目录的 `data/`（`config`、`dist`、`one`）。
- **两步验证（TOTP）**：每个管理员可为自己开启，支持备用码。
- **通行密钥（Passkey / WebAuthn）**：与两步验证二选一，需要域名与受信任证书。

## 安装

1. 填入公网 IPv4（必填）、可选 IPv6，以及三个端口。
2. 安装完成后访问 `https://<服务器IP>:<管理界面端口>`。
3. 首次登录：用 `admin` 与「初始密码」一节给出的密码登录，登录后立即设置新密码。

## 初始密码

初始密码由容器首次启动时随机生成，**不会打印到日志**，也不会出现在页面上。三种取法任选：

- 1Panel 应用「终端」里执行：`cat /app/config/admin-password`
- 宿主机上直接读文件：
  `sudo find /opt/1panel/apps -maxdepth 6 -name admin-password -exec cat {} \;`
- 用 docker 进容器读：`docker exec <容器名> cat /app/config/admin-password`

登录后必须先改密码，改完该文件会被删除；之后再忘记密码，删掉
`data/config/admin-password` 同级的 `data/config/ztncui-passwd` 并重启容器即可重新生成
（会覆盖现有管理员密码）。

> 默认使用 Docker Hub 镜像 `docker.io/lonelyx/zerotier-planet:<版本号>`（不带 `v`）；
> GitHub Container Registry 上的同名镜像 `ghcr.io/ban-sky/zerotier-planet:<版本号>` 内容一致，也可直接使用。

## 自动更新（计划任务）

一行命令即可把最新版本同步进本地商店，**复制直接执行**，或贴进
**计划任务 → Shell 脚本** 定时跑：

```bash
curl -fsSL https://raw.githubusercontent.com/ban-sky/zerotier-planet-2.0/main/scripts/1panel-scheduled-update.sh | sudo bash -s -- --quiet
```

脚本参考 [okxlin/appstore](https://github.com/okxlin/appstore) 的做法，把应用包
同步进 `/opt/1panel/resource/apps/local/`，面板刷新后就能看到新版本；要手动执行时：

```bash
# 下载后执行一次（脚本也随 Release 附件发布）
sudo ./1panel-scheduled-update.sh --dry-run               # 先看会做什么
sudo ./1panel-scheduled-update.sh --quiet                 # 自动选最快通道
sudo ./1panel-scheduled-update.sh --source cdn --quiet    # 只走 jsDelivr，国内推荐
sudo ./1panel-scheduled-update.sh --source branch --quiet # 跟 main 分支
sudo ./1panel-scheduled-update.sh \
  --mirror https://ghfast.top/ --quiet                    # 用 GitHub 镜像下载
sudo ./1panel-scheduled-update.sh \
  --source dir --from-dir /root/zerotier-planet-2.0 --quiet # 完全离线
```

脚本会更新本应用包并重启已安装实例；`--no-restart` 只更新应用包。国内网络下每个请求
最多 8 秒就放弃并自动换通道（jsDelivr / 镜像），不会一直卡着重试。详细参数见
[项目 README](https://github.com/ban-sky/zerotier-planet-2.0#计划任务自动跟进最新版本)。

## 端口

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 9994 | UDP | ZeroTier 服务端口，需在防火墙放行 |
| 3443 | TCP | 管理界面（HTTPS） |
| 3000 | TCP | planet/moon 下载（HTTPS，需密钥） |
