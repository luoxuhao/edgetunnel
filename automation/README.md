# edgetunnel 无人值守更新（现有 Pages 项目）

这套流程用于 `luoxuhao/edgetunnel` 的 `main` 分支。同步 `cmliu/edgetunnel` 的最新 main，不是 Release。目标是：上游更新后自动同步、自动部署到现有 Cloudflare Pages，并用独立 Cloudflare Cron 避开 GitHub 60 天定时任务休眠问题。

## 最短部署路径

### A. GitHub 变量 / Secrets

进入：

`Settings → Secrets and variables → Actions`

添加：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Variable | `CF_PAGES_PROJECT` | 现有 Cloudflare Pages 项目名称 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| Secret | `CLOUDFLARE_API_TOKEN` | Pages 部署用 Token，至少目标账号 Pages Edit |
| Secret | `CLOUDFLARE_SCHEDULER_API_TOKEN` | 部署 Scheduler Worker 用 Token，至少 Workers Scripts Edit + Workers Cron Triggers Edit |
| Secret | `GITHUB_SCHEDULER_PAT` | GitHub Fine-grained PAT，仅授权 `luoxuhao/edgetunnel`，Actions: Read and write |

> `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_SCHEDULER_API_TOKEN` 可以使用同一个权限足够的 Cloudflare API Token，但分开保存更容易以后收紧权限。

### B. Cloudflare Pages

现有 Pages 项目保持原来的生产环境变量、Secrets、KV 绑定和兼容日期。

确认：

- Production branch = `main`
- 关闭 **Enable automatic production branch deployments**
- 自动 Preview deployment 设为 None

这样避免 Cloudflare Git 集成和本仓库的 Wrangler 自动发布同时抢生产部署。

### C. 一键部署防休眠 Scheduler Worker

GitHub：

`Actions → Deploy update scheduler → Run workflow`

这个工作流会自动：

1. 创建 / 更新 Worker：`edgetunnel-update-scheduler`
2. 部署 `automation/scheduler/scheduler.mjs`
3. 设置 Cron：`17 */6 * * *`
4. 把 `GITHUB_SCHEDULER_PAT` 写入 Worker Secret `GITHUB_TOKEN`

这个 Worker 每 6 小时调用 GitHub API。若 `sync.yml` 因 inactivity 变成 `disabled_inactivity`，它会先重新 Enable，再触发 workflow。

### D. 首次验证主更新流程

GitHub：

`Actions → Sync and deploy Pages → Run workflow`

确认任务成功后，再确认 Cloudflare Pages 出现新的 Production deployment，并测试你的实际订阅 / 连接。

之后流程为：

```
Cloudflare Cron
      ↓
edgetunnel-update-scheduler
      ↓
GitHub workflow_dispatch
      ↓
sync.yml
      ↓
检查 cmliu/edgetunnel 最新 main
      ↓
同步 _worker.js / LICENSE / CHANGELOG
      ↓
有变化则 commit
      ↓
Wrangler 发布到现有 Pages
      ↓
确认 Production deployment 成功
```

## 工作方式

独立 Cloudflare Worker 每 6 小时通过 GitHub API 触发 `sync.yml`。GitHub 内没有 schedule，不需要制造空提交保活。工作流验证配置，从同一个上游 commit 下载 `_worker.js`、`LICENSE`、`CHANGELOG`，检查 JavaScript 语法，普通提交并推送，然后使用 Wrangler 发布到现有 Pages 项目。只有确认新的生产部署成功后才写入 `automation/deployed.json`。

无更新且已记录的部署仍为当前生产部署时跳过发布。下载、推送、发布或确认失败会使任务失败，下次定时触发重新尝试。网络读取有有限重试，发布失败可能已产生一个部署，下一次会重新发布以恢复一致性。生产发布串行执行，不强制推送。人工并发提交导致推送被拒绝时，下次任务从最新 main 重试。

**自动更新会替换 `_worker.js` 中的个人修改。** 个性化配置请放在 Pages 环境变量和 KV 中。仓库中的 `wrangler.toml`、README 和工作流不会从上游覆盖。若上游以后增加其他必要文件、依赖或改变运行时要求，需要维护此白名单和兼容日期；这不是永远不需维护的保证。

## 暂停、恢复与回滚

- 暂停：在 GitHub Actions 手动 Disable `Sync and deploy Pages`；Scheduler Worker 会尊重 `disabled_manually`。
- 恢复：手动 Enable workflow，再 Run workflow。
- 若只是 GitHub inactivity 导致 `disabled_inactivity`，Scheduler Worker 会自动重新启用。
- 重发：Run workflow 时勾选 `force_deploy`。
- 业务故障回滚：先暂停 workflow，再在 Pages 控制台回滚到以前的成功部署。

## 本地验证

```sh
node --test automation/update.test.mjs
```

官方参考：

- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://docs.github.com/en/rest/actions/workflows
