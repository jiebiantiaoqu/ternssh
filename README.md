<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="web/public/logo-light.png" />
    <img src="web/public/logo-light.png" alt="ternssh logo" width="96" height="93" />
  </picture>
</p>

<h1 align="center">ternssh</h1>

<p align="center">
  基于 Cloudflare 的 SSH 工作台<br />
  可拖拽仪表盘 · 终端 · SFTP · 状态监控
</p>

<p align="center">
  <a href="LICENSE">GPL-3.0-or-later</a>
  ·
  <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/HaradaKashiwa/ternssh">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/HaradaKashiwa/ternssh/refs/heads/main/docs/preview.png">
    <img src="docs/preview.png" alt="ternssh 仪表盘预览" width="1024" />
  </a>
</p>

---

**ternssh** 是一款运行在 Cloudflare Edge 上的 SSH 管理工具。完整文档见 **[Wiki](https://github.com/HaradaKashiwa/ternssh/wiki)**。

## 部署

详见 [Wiki · 部署](https://github.com/HaradaKashiwa/ternssh/wiki/zh-Deployment)。

## 鉴权

默认**开放模式**，无需登录。生产环境建议启用 **Cloudflare Access**（Workers）或 **HTTP Basic Auth**（Docker / 自托管）。

详见 [Wiki · 鉴权](https://github.com/HaradaKashiwa/ternssh/wiki/zh-Security#鉴权)。
