> [← README](../../README.md) · [Wiki](../README.md) · [English](../en/Home.md)
>
> [简介](../zh/Home.md) · [功能特性](../zh/Features.md) · [技术栈](../zh/Tech-Stack.md) · [快速开始](../zh/Getting-Started.md) · **部署** · [Docker](../zh/Docker.md) · [项目结构](../zh/Project-Structure.md) · [系统架构](../zh/Architecture.md) · [小部件](../zh/Widgets.md) · [API](../zh/API.md) · [数据库](../zh/Database.md) · [设置](../zh/Settings.md) · [安全](../zh/Security.md) · [配置](../zh/Configuration.md) · [路线](../zh/Roadmap.md) · [License](../zh/License.md)

## 部署

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/HaradaKashiwa/ternssh">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
</a>

项目有两份 Wrangler 配置，用途不同：

| 文件 | 用途 | D1 | 变量 |
|------|------|-----|------|
| `wrangler.jsonc` | 本地 `wrangler dev` | `local-ternssh-db` | 无（Access 等请在控制台配置） |
| `wrangler.production.jsonc` | 生产部署（gitignore） | 真实远程 ID | 无 |

#### 部署命令

| 命令 | 场景 | 实际做了什么 |
|------|------|--------------|
| **`npm run deploy`** | Cloudflare 一键部署 / Builds 的 Deploy 步骤（自动检测） | 生成 production 配置 → D1 迁移 → `wrangler deploy --config wrangler.production.jsonc` |
| **`npm run release`** | 本地一键（构建 + 发布） | `build` → `deploy` |
| **`npm run cf:deploy`** | 同 `deploy`（兼容旧文档） | 同上 |
| ~~`npx wrangler deploy`~~ | **不要用于生产** | 默认读 `wrangler.jsonc`，D1 为本地占位 ID，不含迁移步骤 |

**结论：Cloudflare 一键部署会自动检测 `npm run build` + `npm run deploy`，直接接受即可。不要用裸的 `npx wrangler deploy`。**

`npm run deploy` 与裸 `wrangler deploy` 的区别：

1. **配置文件**：`wrangler.production.jsonc`（真实 D1 ID） vs `wrangler.jsonc`（本地开发）
2. **D1 迁移**：自动执行 `migrations apply --remote` vs 无
3. **控制台变量**：production 配置不含 `vars`，不会覆盖你在 Dashboard 设置的 `ACCESS_*`；裸 deploy 历史上容易把 `vars` 同步错（现已从 `wrangler.jsonc` 移除 `vars`，但仍缺 D1 ID 与迁移）

**首次部署到 Cloudflare：**

```bash
# 1. 创建远程 D1 数据库
npx wrangler d1 create ternssh
# 记下输出的 database_id

# 2. 生成本地生产配置（二选一）

# 方式 A：复制模板后手动编辑 account_id / database_id
npm run deploy:config
# 编辑 wrangler.production.jsonc

# 方式 B：用环境变量生成（适合 CI / Cloudflare 构建）
export D1_DATABASE_ID=<上一步的 database_id>
export CLOUDFLARE_ACCOUNT_ID=<可选，多账号时指定>

# 3. 部署
npm run release
```

**Cloudflare 一键部署 / Workers Builds（Git 连接）**：

Cloudflare 会自动检测 `package.json` 中的 `build` 与 `deploy` 脚本，预填为：

| 步骤 | 命令（自动检测） |
|------|------------------|
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |

直接接受即可，无需改成 `npx wrangler deploy`。Build 阶段会 `postbuild` 生成 production 配置；Deploy 阶段跑迁移并发布。

D1 可自动发现（账号下名为 `ternssh` 的数据库），或在 Build variables 中设置 `D1_DATABASE_ID` / `CLOUDFLARE_ACCOUNT_ID`。

认证相关变量（`ACCESS_*`、`BASICAUTH_*`）**只在 Workers Dashboard → Variables and Secrets 或 Docker 环境变量中配置**，不要写进 wrangler 配置文件。

> 若 Deploy command 误用 `npx wrangler deploy`，可能用错 wrangler 配置并覆盖控制台变量。请改回 `npm run deploy`。

| 组件 | 平台 |
|------|------|
| API + 前端 | Cloudflare Workers（`server/public/` 为 Vite 产物） |
| 数据库 | Cloudflare D1 |
| SSH 会话 | Durable Objects (`SshSession`) |
| 认证（可选） | Cloudflare Access / HTTP Basic Auth | 可选门禁；通过后共享同一工作区 |

认证配置详见 [安全说明 · 鉴权](../zh/Security.md#鉴权)。
