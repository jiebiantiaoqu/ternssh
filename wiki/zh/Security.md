> [← README](../../README.md) · [Wiki](../README.md) · [English](../en/Home.md)
>
> [简介](../zh/Home.md) · [功能特性](../zh/Features.md) · [技术栈](../zh/Tech-Stack.md) · [快速开始](../zh/Getting-Started.md) · [部署](../zh/Deployment.md) · [Docker](../zh/Docker.md) · [项目结构](../zh/Project-Structure.md) · [系统架构](../zh/Architecture.md) · [小部件](../zh/Widgets.md) · [API](../zh/API.md) · [数据库](../zh/Database.md) · [设置](../zh/Settings.md) · **安全** · [配置](../zh/Configuration.md) · [路线](../zh/Roadmap.md) · [License](../zh/License.md)

## 安全说明

- **开放模式**无应用层认证，请勿在公网暴露敏感环境
- Access 模式仅作登录门禁，所有通过校验的请求使用内置用户 `default` 的数据
- SSH 密码/私钥存于 D1 `credentials` 表（按服务器引用）；vault 条目存于 `saved_passwords` / `saved_private_keys`
- 全站 HTTPS / WSS；DO 实例按 session 隔离

## 鉴权

ternssh 提供三种访问模式，通过环境变量切换：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **开放模式** | 不配置任何认证变量 | 本地开发、内网部署 |
| **Cloudflare Access** | Zero Trust JWT 校验 | Cloudflare Workers 生产部署 |
| **HTTP Basic Auth** | 用户名 + 密码 | Docker、自托管 |

Access 与 Basic Auth **可同时启用**（需同时通过）。变量**不要**写进 `wrangler.production.jsonc`，在 Workers Dashboard 或 Docker 环境变量中配置。

### 开放模式

不设置下方任何变量即可。任何人可访问应用，所有用户共享同一套服务器与布局数据。

### Cloudflare Access

1. 在 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) 创建 **Self-hosted Application**
2. **Application domain** 必须与实际访问域名一致（`*.workers.dev` 与自定义域名需分别创建应用）
3. 在 **Workers → Settings → Variables and Secrets** 中配置：

| 名称 | 类型 | 示例 |
|------|------|------|
| `ACCESS_TEAM_DOMAIN` | Variable | `your-team.cloudflareaccess.com`（不要加 `https://`） |
| `ACCESS_AUD` | Secret 或 Variable | 从 Access 应用复制的 AUD Tag（64 位 hex） |

本地开发可在 `.dev.vars` 中设置（参考 `.dev.vars.example`）。

### HTTP Basic Auth

同时设置用户名与密码：

| 名称 | 类型 | 说明 |
|------|------|------|
| `BASICAUTH_USERNAME` | Variable | HTTP Basic Auth 用户名 |
| `BASICAUTH_PASSWORD` | Secret | HTTP Basic Auth 密码 |

**Docker 示例**（`docker-compose.yml`）：

```yaml
environment:
  BASICAUTH_USERNAME: "${BASICAUTH_USERNAME:-}"
  BASICAUTH_PASSWORD: "${BASICAUTH_PASSWORD:-}"
```

启用后，同一 IP 密码错误 **3 次**将锁定 **1 小时**（按 `CF-Connecting-IP` 识别；登录成功后清零）。
