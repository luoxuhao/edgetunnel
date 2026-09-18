# edgetunnel 无人值守更新（现有 Pages 项目）

这套流程用于 `luoxuhao/edgetunnel` 的 `main` 分支。同步 `cmliu/edgetunnel` 的最新 main，不是 Release。代码合并只是准备完成，必须完成下面的一次性配置和首次运行验证才会自动更新。

## 工作方式

独立 Cloudflare Worker 每 6 小时通过 GitHub API 触发 `sync.yml`。GitHub 内没有 schedule，不需要制造空提交保活。工作流验证配置，从同一个上游 commit 下载 `_worker.js`、`LICENSE`、`CHANGELOG`，检查 JavaScript 语法，普通提交并推送，然后使用 Wrangler 发布到现有 Pages 项目。只有确认新的生产部署成功后才写入 `automation/deployed.json`。

无更新且已记录的部署仍为当前生产部署时跳过发布。下载、推送、发布或确认失败会使任务失败，下次定时触发重新尝试。网络读取有有限重试，发布失败可能已产生一个部署，下一次会重新发布以恢复一致性。生产发布串行执行，不强制推送。人工并发提交导致推送被拒绝时，下次任务从最新 main 重试。

**自动更新会替换 `_worker.js` 中的个人修改。** 个性化配置请放在 Pages 环境变量和 KV 中。仓库中的 `wrangler.toml`、README 和工作流不会从上游覆盖。若上游以后增加其他必要文件、依赖或改变运行时要求，需要维护此白名单和兼容日期；这不是永远不需维护的保证。

## 一次性配置

1. 在 Cloudflare 打开现有 Pages 项目，确认生产分支为 `main`。保存好原有生产环境变量、Secrets、KV 绑定和兼容日期，不需要删除或新建 Pages 项目。
2. 在 Pages 的 Build / Branch control 关闭 **Enable automatic production branch deployments**；将自动预览部署设为 None，避免新旧流程争抢发布。GitHub 连接可以保留。关闭自动构建不会停止当前线上部署。
3. 在 GitHub 仓库 Settings → Secrets and variables → Actions 设置：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Variable | `CF_PAGES_PROJECT` | 现有 Pages 项目名称，不是域名 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID，32 位十六进制 |
| Secret | `CLOUDFLARE_API_TOKEN` | 只授予目标账号 Cloudflare Pages Edit 权限的 API Token |

4. 将本改动合并至 main，在 GitHub Actions 启用工作流，选择 **Sync and deploy Pages → Run workflow**。确认任务成功、Pages 生产部署更新，并实际测试你的订阅和连接。单纯部署成功不能验证代理协议、KV 数据或所有业务功能。
5. 建立**独立** Worker，名称可用 `edgetunnel-update-scheduler`。将 `automation/scheduler/scheduler.mjs` 的代码部署给它，添加 Secret `GITHUB_TOKEN`。此处使用 GitHub fine-grained PAT：仅选择 `luoxuhao/edgetunnel`，授予 **Actions: Read and write**，Metadata 默认读取。不要授予全部仓库权限，也不要将 Token 写入代码。
6. 给这个独立 Worker 添加 Cron Trigger：`17 */6 * * *`（UTC；每 6 小时）。可用 `automation/scheduler/wrangler.toml` 部署，也可在控制台添加。Worker 不提供 HTTP 触发入口。不要用它覆盖 edgetunnel 本身。
7. 验证一次定时触发：Worker 日志出现 Update requested 后，GitHub 应出现新的工作流运行。必须再确认 GitHub 的运行结果；Worker 请求成功仅表示 GitHub 接受了请求。

CLI 部署定时 Worker 的示例（需先安装 Node.js 并登录自己的 Cloudflare 账号）：

```sh
npx wrangler@4.135.0 login
npx wrangler@4.135.0 deploy --config automation/scheduler/wrangler.toml
npx wrangler@4.135.0 secret put GITHUB_TOKEN --config automation/scheduler/wrangler.toml
```

GitHub PAT 到期或撤销后需要更换；到期时间取决于你的账号/组织策略。Cloudflare Token 同理。请开启 GitHub Actions 失败通知，并查看定时 Worker 日志/按需配置 Cloudflare 告警。凭据、平台故障或上游破坏性更新仍可能需要人工处理。

## 暂停、恢复与回滚

- 暂停：在 GitHub Actions 手动 Disable workflow，定时 Worker 会尊重 `disabled_manually`；也可删除 Worker 的 Cron Trigger。
- 恢复：手动 Enable workflow，再 Run workflow。若只是旧工作流遗留的 `disabled_inactivity`，定时 Worker 会调用启用 API 后触发。
- 重发：Run workflow 勾选 `force_deploy`。没有修改源码也会重新发布。
- 业务故障回滚：先暂停工作流，再在 Pages 控制台回滚到以前的成功部署。未暂停时，下一次运行会重新发布上游版本。
- 不自动回滚业务错误：脚本验证语法和 Cloudflare 部署状态，不会用未经验证的 HTTP 探针认定代理业务正常。

## 验证

```sh
node --test automation/update.test.mjs
```

覆盖网络重试、认证失败、部署指纹变化、定时触发和尊重手动暂停。线上发布、账号权限和环境变量需在配置后进行首次实际验证。

官方参考：
- https://developers.cloudflare.com/pages/configuration/git-integration/ （现有 Git 项目关闭自动部署后可使用 Wrangler 发布）
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://docs.github.com/en/rest/actions/workflows
