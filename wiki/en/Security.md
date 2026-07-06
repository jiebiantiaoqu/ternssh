> [← README](../../README.en.md) · [Wiki](../README.md) · [中文](../zh/Home.md)
>
> [Overview](../en/Home.md) · [Features](../en/Features.md) · [Tech Stack](../en/Tech-Stack.md) · [Quick Start](../en/Getting-Started.md) · [Deployment](../en/Deployment.md) · [Docker](../en/Docker.md) · [Project Structure](../en/Project-Structure.md) · [Architecture](../en/Architecture.md) · [Widgets](../en/Widgets.md) · [API](../en/API.md) · [Database](../en/Database.md) · [Settings](../en/Settings.md) · **Security** · [Configuration](../en/Configuration.md) · [Roadmap](../en/Roadmap.md) · [License](../en/License.md)

## Security

- **Open mode** has no application-layer authentication—do not expose sensitive environments on the public internet
- Access mode is a login gate only; all verified requests use the built-in `default` user data
- SSH passwords/keys are stored in D1 `credentials` (per server); vault entries in `saved_passwords` / `saved_private_keys`
- Full-site HTTPS / WSS; DO instances isolated per session

## Authentication

ternssh supports three access modes, switched via environment variables:

| Mode | Description | Best for |
|------|-------------|----------|
| **Open mode** | No auth variables configured | Local dev, private networks |
| **Cloudflare Access** | Zero Trust JWT verification | Cloudflare Workers production |
| **HTTP Basic Auth** | Username + password | Docker, self-hosted |

Access and Basic Auth can be **enabled together** (both must pass). Configure variables in the Workers Dashboard or Docker env—**not** in `wrangler.production.jsonc`.

### Open mode

Leave all variables below unset. Anyone can reach the app; all users share the same servers and layout.

### Cloudflare Access

1. Create a **Self-hosted Application** in [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. The **Application domain** must match the URL you visit (`*.workers.dev` vs custom domain need separate apps)
3. Set in **Workers → Settings → Variables and Secrets**:

| Name | Type | Example |
|------|------|---------|
| `ACCESS_TEAM_DOMAIN` | Variable | `your-team.cloudflareaccess.com` (no `https://`) |
| `ACCESS_AUD` | Secret or Variable | AUD Tag from your Access app (64-char hex) |

For local dev, use `.dev.vars` (see `.dev.vars.example`).

### HTTP Basic Auth

Set both username and password:

| Name | Type | Notes |
|------|------|-------|
| `BASICAUTH_USERNAME` | Variable | HTTP Basic Auth username |
| `BASICAUTH_PASSWORD` | Secret | HTTP Basic Auth password |

**Docker example** (`docker-compose.yml`):

```yaml
environment:
  BASICAUTH_USERNAME: "${BASICAUTH_USERNAME:-}"
  BASICAUTH_PASSWORD: "${BASICAUTH_PASSWORD:-}"
```

When enabled, **3** failed password attempts from the same IP lock access for **1 hour** (via `CF-Connecting-IP`; cleared on successful login).
