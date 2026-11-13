## 产品介绍

在 Docker 中自建 **ZeroTier planet（行星服务器）** 与 **ztncui 网络控制器**，对应
[docker-zerotier-planet 2.0](https://github.com/ban-sky/docker-zerotier-planet-2.0) 项目。
内置 ZeroTier One 1.16.2，默认开启 TLS 与安全加固项。

## 主要功能

- 自动生成 planet 与 moon 文件，客户端可用自定义 planet 加入你的网络。
- 首次启动生成随机管理员密码，首次登录强制改密，改密后密码文件自动删除。
- 管理界面与文件服务器默认 HTTPS（自签 ECDSA P-256 证书）。
- 管理界面内置简体中文与英文，默认简体中文，右上角可切换。
- planet 下载走 `Authorization: Bearer` 鉴权，不再把密钥放在 URL 里。
- 数据持久化在应用目录的 `data/`（`config`、`dist`、`one`）。

## 安装

1. 填入公网 IPv4（必填）、可选 IPv6，以及三个端口。
2. 安装完成后访问 `https://<服务器IP>:<管理界面端口>`。
3. 首次登录：进入应用「终端」，执行
   `cat /app/config/admin-password` 取初始密码，用 `admin` 登录并立即改密。

## 自动更新（计划任务）

把项目里的 `scripts/1panel-scheduled-update.sh` 挂到 **计划任务 → Shell 脚本**，即可按周期
跟进新版本。脚本参考 [okxlin/appstore](https://github.com/okxlin/appstore) 的做法，把应用包
同步进 `/opt/1panel/resource/apps/local/`，面板刷新后就能看到新版本：

```bash
# 下载后执行一次（脚本也随 Release 附件发布）
sudo ./1panel-scheduled-update.sh --dry-run              # 先看会做什么
sudo ./1panel-scheduled-update.sh --quiet                # 跟最新 Release
sudo ./1panel-scheduled-update.sh --source branch --quiet # 跟 main 分支
sudo ./1panel-scheduled-update.sh --source branch \
  --mirror https://ghproxy.net/ --quiet                  # 国内网络走镜像
```

脚本会更新本应用包并重启已安装实例；`--no-restart` 只更新应用包。详细参数见
[项目 README](https://github.com/ban-sky/docker-zerotier-planet-2.0#计划任务自动跟进最新版本)。

## 端口

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 9994 | UDP | ZeroTier 服务端口，需在防火墙放行 |
| 3443 | TCP | 管理界面（HTTPS） |
| 3000 | TCP | planet/moon 下载（HTTPS，需密钥） |
