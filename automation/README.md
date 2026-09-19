# edgetunnel 无人值守更新

这套流程用于 `luoxuhao/edgetunnel` 的 `main`，同步 `cmliu/edgetunnel` 最新 main，并自动发布到现有 Cloudflare Pages。

```
Cloudflare Cron（每 6 小时）
        ↓
edgetunnel-update-scheduler
        ↓
GitHub workflow_dispatch
        ↓
.github/workflows/sync.yml
        ↓
同步上游指定文件
        ↓
有更新则 commit
        ↓
Wrangler 发布到 Pages
```

GitHub 不依赖 `schedule`，所以不受公共仓库 60 天无活动后 scheduled workflow 自动停用这一点影响。

## 当前仓库已经准备好的部分

已包含：

- `.github/workflows/sync.yml`
- `.github/workflows/deploy-scheduler.yml`
- `.github/workflows/check-setup.yml`
- `automation/update.mjs`
- `automation/update.test.mjs`
- `automation/scheduler/scheduler.mjs`
- `automation/scheduler/wrangler.toml`

GitHub Variables 已配置：

- `CF_PAGES_PROJECT=edgetunnel`
- `CLOUDFLARE_ACCOUNT_ID`

## 现在只缺两个 Secret

进入：

`Settings → Secrets and variables → Actions → Secrets`

添加：

### 1. CLOUDFLARE_API_TOKEN

同一个 Token 同时用于：

- 读取/修改目标 Pages 项目
- Wrangler 发布 Pages
- 创建/更新 `edgetunnel-update-scheduler` Worker
- 配置 Cron

因此 Token 需要同时具备 **Pages Write**，以及 Workers 产品范围的 **Admin**（首次创建 Scheduler Worker 需要；创建后日常部署只需 Editor）。限制在你自己的 Cloudflare Account。

### 2. GITHUB_SCHEDULER_PAT

GitHub Fine-grained PAT：

- Repository access：仅 `luoxuhao/edgetunnel`
- Repository permission：`Actions: Read and write`
- Metadata 保持默认读取

它只存进 Cloudflare Scheduler Worker，用于未来每 6 小时触发 `sync.yml`。

## 填完两个 Secret 后只需要点一次

GitHub：

`Actions → Deploy update scheduler → Run workflow`

这个工作流会自动完成：

1. 校验 Cloudflare 项目和 Token
2. 校验 GitHub PAT
3. 跑自动化单元测试
4. 通过 Cloudflare API 自动关闭 Pages Git 自动生产部署
5. 自动关闭 Pages Git Preview 部署
6. 部署/更新独立 Worker `edgetunnel-update-scheduler`
7. 设置 Cron `17 */6 * * *`
8. 把 `GITHUB_SCHEDULER_PAT` 写入 Worker Secret `GITHUB_TOKEN`
9. 自动触发第一次 `Sync and deploy Pages`

后续 `automation/scheduler/**` 如果修改，Scheduler Worker 也会自动重新部署。

## 自动同步范围

当前只同步上游：

```text
_worker.js
LICENSE
CHANGELOG
```

不会覆盖：

```text
.github/workflows/
automation/
README.md
wrangler.toml
```

因此上游更新不会把这套自动化本身覆盖掉。

> 自动更新会替换你 fork 里的 `_worker.js`。个性化配置应放在 Cloudflare Pages 环境变量、Secrets 和 KV 中。

## 失败处理

- 上游无变化：不提交。
- 网络/部署失败：当前任务失败，下一次 Cron 再重试。
- Pages 新生产部署未确认成功：不记录成功状态，下次继续重试。
- 手动 Disable `Sync and deploy Pages`：Scheduler 尊重人工暂停。
- 需要回滚：先 Disable workflow，再在 Cloudflare Pages 回滚到旧部署。

## 自检

也可以单独运行：

`Actions → Check unattended update setup → Run workflow`

它会检查 Variables、两个 Secrets、Cloudflare Pages 访问、GitHub PAT 和自动化单元测试。
