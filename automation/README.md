# edgetunnel 自动更新（Cloudflare Pages + GitHub）

当前方案已经改成和 cfnew 更接近的结构：

```
cmliu/edgetunnel
      ↓
GitHub Actions 每 6 小时检查一次
      ↓
luoxuhao/edgetunnel main
      ↓
只有上游文件变化才 commit
      ↓
Cloudflare Pages Git Integration
      ↓
自动 Production 部署
```

不再需要：

- Cloudflare API Token
- GitHub PAT
- 独立 Cloudflare Scheduler Worker
- Wrangler 从 GitHub Actions 主动发布 Pages

## GitHub 自动同步

工作流：

`.github/workflows/sync.yml`

每 6 小时检查：

```text
_worker.js
LICENSE
CHANGELOG
```

如果上游没有变化：

- 不产生 commit
- Cloudflare Pages 不部署

如果上游有变化：

- 自动更新这 3 个文件
- 自动 commit 到 main
- Cloudflare Pages 因 main 有新 commit 自动 Production 部署

## 60 天 scheduled workflow 保活

GitHub 官方会在公共仓库连续 60 天没有 repository activity 时自动停用 scheduled workflows。

因此额外使用：

`.github/workflows/keepalive.yml`

每月 1 日、15 日创建一个很小的：

`.github/keepalive`

提交信息固定为：

`[CF-Pages-Skip] Keep scheduled workflows active`

Cloudflare Pages 官方支持使用 `[CF-Pages-Skip]` 提交前缀跳过本次 Pages 部署，所以这个保活 commit 不会造成无意义的 Pages 重建。

## Cloudflare Pages 需要的一次性设置

### 如果现有 Pages 已经连接 GitHub

确认：

- Git repository：`luoxuhao/edgetunnel`
- Production branch：`main`
- Enable automatic production branch deployments：开启
- Preview branches：建议设为 None
- Framework preset：None
- Build command：留空
- Build output directory：`.`

保留原有：

- ADMIN / KEY / UUID / PROXYIP 等变量
- Secrets
- KV 绑定
- 自定义域
- Compatibility date

### 如果现有 Pages 是 Direct Upload / 上传 ZIP 创建

Cloudflare 不支持把 Direct Upload 项目直接转换成 Git Integration。

需要新建一个 Pages Git 项目：

1. Workers & Pages → Create
2. Pages → Import an existing Git repository
3. 选择 `luoxuhao/edgetunnel`
4. Production branch：`main`
5. Framework preset：None
6. Build command：留空
7. Build output directory：`.`
8. 部署完成后，把旧项目的环境变量、KV、Secrets、自定义域迁移过去

## 推荐的 Cloudflare Build 设置

为了避免其它仓库维护文件变动触发部署，可以在：

`Settings → Build → Build watch paths`

设置 Include paths：

```text
_worker.js
LICENSE
CHANGELOG
```

这是额外优化，不设置也能正常工作。

保活 commit 已经带 `[CF-Pages-Skip]`，即使不配置 Build watch paths，也会被 Cloudflare 跳过。

## 第一次验证

GitHub：

`Actions → Sync upstream → Run workflow`

如果当前上游和本仓库完全一致，会显示 No upstream changes。

以后上游有变化时会自动 commit，Cloudflare Pages 应紧接着出现新的 Production deployment。

还可以手动测试：

`Actions → Keep scheduled workflows active → Run workflow`

它会生成 `.github/keepalive`，但 Cloudflare Pages 应跳过该 commit 的部署。

## 安全性

本方案不需要任何额外 Secret。

GitHub Actions 使用仓库自己的 `GITHUB_TOKEN` 写入当前仓库，不需要创建 PAT。

Cloudflare Pages 使用官方 GitHub App 读取仓库并自动部署，不需要把 Cloudflare API Token 存在 GitHub。
