## 产品介绍

在 Docker 中自建 **ZeroTier planet（行星服务器）** 与 **ztncui 网络控制器**，对应
[docker-zerotier-planet 2.0](https://github.com/ban-sky/docker-zerotier-planet-2.0) 项目。
内置 ZeroTier One 1.16.2，默认开启 TLS 与安全加固项。

## 主要功能

- 自动生成 planet 与 moon 文件，客户端可用自定义 planet 加入你的网络。
- 首次启动生成随机管理员密码，首次登录强制改密，改密后密码文件自动删除。
- 管理界面与文件服务器默认 HTTPS（自签 ECDSA P-256 证书）。
- planet 下载走 `Authorization: Bearer` 鉴权，不再把密钥放在 URL 里。
- 数据持久化在应用目录的 `data/`（`config`、`dist`、`one`）。

## 安装

1. 填入公网 IPv4（必填）、可选 IPv6，以及三个端口。
2. 安装完成后访问 `https://<服务器IP>:<管理界面端口>`。
3. 首次登录：进入应用「终端」，执行
   `cat /app/config/admin-password` 取初始密码，用 `admin` 登录并立即改密。

## 端口

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 9994 | UDP | ZeroTier 服务端口，需在防火墙放行 |
| 3443 | TCP | 管理界面（HTTPS） |
| 3000 | TCP | planet/moon 下载（HTTPS，需密钥） |
