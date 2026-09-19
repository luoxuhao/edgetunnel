# edgetunnel 无人值守更新

这套流程用于 `luoxuhao/edgetunnel` 的 `main` 分支，同步 `cmliu/edgetunnel` 最新 main，并自动发布到现有 Cloudflare Pages。

核心结构：

```
Cloudflare Cron（每 6 小时）
        ↓
edgetunnel-update-scheduler
        ↓
GitHub workflow_dispatch
        ↓
.github/workflows/sync.yml
        ↓
检查 cmliu/edgetunnel
        ↓
同步 _worker.js / LICENSE / CHANGELOG
        ↓
有更新则 commit
        ↓
Wrangler 发布到现有 Pages
```

GitHub 本身不再使用 `schedule`，因此不依赖公共仓库 60 天 inactivity 的定时任务。Scheduler Worker 从 Cloudflare 外部触发 GitHub。

## 你只需要一次性填 4 项

GitHub 仓库：

`Settings → Secrets and variables → Actions`

### Variables

| 名称 | 内容 |
| --- | --- |
| `CF_PAGES_PROJECT` | 你现有 Cloudflare Pages 项目名称，不是域名 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID，32 位十六进制 |

### Secrets

| 名称 | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 一个同时具备目标账号 Pages 部署和 Workers/Scheduler 部署权限的 Cloudflare API Token |
| `GITHUB_SCHEDULER_PAT` | GitHub Fine-grained PAT，仅授权 `luoxuhao/edgetunnel`，Actions: Read and write |

Cloudflare Token 同时给主 Pages 发布和 Scheduler Worker 使用，避免维护两套 Token。

## Cloudflare Pages 一次性设置

现有 Pages 项目保留原来的：

- 环境变量 / Secrets
- KV 绑定
- 自定义域
- 兼容日期

确认：

- Production branch = `main`
- 关闭 **Enable automatic production branch deployments**
- 自动 Preview deployment 设为 None

这样 Cloudflare Git 自动部署不会和本仓库的 Wrangler 发布抢生产环境。

## 部署顺序

### 1. 自检

GitHub：

`Actions → Check unattended update setup → Run workflow`

它会检查：

- 4 项配置是否存在
- Cloudflare Token 是否能读取目标 Pages 项目
- GitHub PAT 是否能访问 `sync.yml`
- 自动更新逻辑单元测试是否通过

### 2. 部署防休眠 Scheduler

GitHub：

`Actions → Deploy update scheduler → Run workflow`

它会自动：

- 创建 / 更新 `edgetunnel-update-scheduler`
- 部署 `automation/scheduler/scheduler.mjs`
- 写入 Worker Secret `GITHUB_TOKEN`
- 设置 Cron：`17 */6 * * *`

以后 `automation/scheduler/**` 有修改时，这个 Worker 也会自动重新部署。

### 3. 首次跑主同步

GitHub：

`Actions → Sync and deploy Pages → Run workflow`

成功后确认 Cloudflare Pages 出现新的 Production deployment，并测试实际订阅 / 连接。

## 自动更新范围

当前只从上游同步：

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

因此自动化系统本身不会被上游 `sync.yml` 覆盖。

**注意：自动更新会替换你仓库里的 `_worker.js`。个性化配置应放在 Cloudflare Pages 环境变量、Secrets 和 KV 中。**

## 失败处理

- 上游无变化：不提交、不重复部署。
- 网络或部署失败：本次 workflow 失败，下次 Scheduler 再重试。
- Pages 生产部署未确认成功：不会记录成功状态，下次继续重试。
- 手动 Disable `Sync and deploy Pages`：Scheduler 会尊重人工暂停。
- 业务故障：先 Disable workflow，再在 Cloudflare Pages 回滚到此前成功部署。

## 本地测试

```sh
node --test automation/update.test.mjs
```
