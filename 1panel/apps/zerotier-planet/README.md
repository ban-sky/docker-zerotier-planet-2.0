## 产品介绍

在 Docker 中自建 **ZeroTier planet（行星服务器）** 与 **ztncui 网络控制器**，对应
[docker-zerotier-planet 2.0](https://github.com/ban-sky/zerotier-planet-2.0) 项目。
内置 ZeroTier One 1.16.2，默认开启 TLS 与安全加固项，装好即可用。

## 快速信息

| 项 | 值 |
| --- | --- |
| 默认镜像 | `docker.io/lonelyx/zerotier-planet:<版本号>`（不带 `v`） |
| 备选镜像 | `ghcr.io/ban-sky/zerotier-planet:<版本号>`（内容相同） |
| 应用目录 | `/opt/1panel/apps/zerotier-planet` |
| 数据目录 | `data/config`、`data/dist`、`data/one` |
| 管理界面 | `https://<服务器IP>:<管理端口>`（自签证书） |
| 初始密码 | 容器内 `/app/config/admin-password` |

## 主要功能

- 首次启动自动生成 planet 与 moon，客户端用自定义 planet 即可加入你的网络。
- 随机初始化管理员密码，首次登录强制改密，改密后密码文件自动删除。
- 管理界面与文件服务器默认 HTTPS（自签 ECDSA P-256），planet 下载改走
  `Authorization: Bearer`，密钥不再出现在 URL 里。
- 界面内置简体中文与英文，默认中文，右上角切换。
- 两步验证（TOTP）与通行密钥（Passkey / WebAuthn）二选一，各自可独立开关。
- 图标与界面使用 ZeroTier 官方品牌标识。

## 安装

1. 在应用商店填表：`IP_ADDR4` 必填（客户端连接用的公网 IPv4），`IP_ADDR6` 可选，
   其余三项端口保持默认即可。
2. 点安装，等待容器状态变成「运行中」。
3. 浏览器打开 `https://<服务器IP>:<管理端口>`，用初始密码登录并改密。

| 字段 | 说明 |
| --- | --- |
| `IP_ADDR4` | 公网 IPv4，必填；会写进 planet 的 `stableEndpoints` |
| `IP_ADDR6` | 公网 IPv6，可选；留空则只发布 IPv4 端点 |
| `PANEL_APP_PORT_ZT` | ZeroTier 服务端口（UDP），默认 9994 |
| `PANEL_APP_PORT_HTTPS` | 管理界面端口（TCP），默认 3443 |
| `PANEL_APP_PORT_FILE` | planet / moon 下载端口（TCP），默认 3000 |

## 初始密码

初始密码由容器首次启动时随机生成，**不会打印到日志**，也不会出现在页面上。任选一种取法：

- 1Panel 应用「终端」里执行：`cat /app/config/admin-password`
- 宿主机上直接读：
  `sudo find /opt/1panel/apps -maxdepth 6 -name admin-password -exec cat {} \;`
- 进容器读：`docker exec <容器名> cat /app/config/admin-password`

登录后必须先改密码，改完该文件会被删除。若之后忘记密码，删掉
`data/config/ztncui-passwd` 并重启容器即可重新生成（会覆盖现有管理员密码）。

## 自动更新（计划任务）

一行命令即可把最新版本同步进本地商店，复制直接执行，或贴进
**计划任务 → Shell 脚本** 定时跑：

```bash
curl -fsSL https://raw.githubusercontent.com/ban-sky/zerotier-planet-2.0/main/scripts/1panel-scheduled-update.sh | sudo bash -s -- --quiet
```

需要手动控制时（脚本也随 Release 附件发布）：

```bash
sudo ./1panel-scheduled-update.sh --dry-run                # 先看会做什么
sudo ./1panel-scheduled-update.sh --quiet                  # 自动选最快通道
sudo ./1panel-scheduled-update.sh --source cdn --quiet     # 只走 jsDelivr，国内推荐
sudo ./1panel-scheduled-update.sh --mirror https://ghfast.top/ --quiet
sudo ./1panel-scheduled-update.sh --no-restart --quiet     # 只更新应用包
```

脚本参考 [okxlin/appstore](https://github.com/okxlin/appstore) 的做法，把应用包同步到
`/opt/1panel/resource/apps/local/`，面板刷新后可看到新版本；默认同时重启已安装实例。
国内网络下每个请求最多等 8 秒就换通道（jsDelivr / 镜像），不会一直重试。完整参数见
[项目 README](https://github.com/ban-sky/zerotier-planet-2.0#计划任务自动跟进最新版本)。

## 端口

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 9994 | UDP | ZeroTier 服务端口，需在防火墙放行 |
| 3443 | TCP | 管理界面（HTTPS） |
| 3000 | TCP | planet / moon 下载（HTTPS，需密钥） |

## 常见问题

- **浏览器提示证书不安全**：自签证书属正常，确认继续或导入证书；也可在反代上换成受信任证书。
- **登录提示「请求来源校验失败」**：多出现在反向代理后。让代理传递 `Host` 与
  `X-Forwarded-Host`，或把域名写进环境变量 `ALLOWED_ORIGINS`。
- **通行密钥用不了**：WebAuthn 需要域名 + 受信任证书，裸 IP 不可用；此时用 TOTP 或纯密码登录。
- **更新后商店里版本没变**：面板缓存需要刷新一次应用商店；仍不变时用 `--source cdn` 重跑脚本。
