# edgetunnel 自动更新（Cloudflare Pages + GitHub）

当前仓库采用“上游自动同步 + Cloudflare Pages Git 集成自动部署”。

```
cmliu/edgetunnel
      ↓
GitHub Actions 每 6 小时检查
      ↓
同步上游项目文件到 luoxuhao/edgetunnel main
      ↓
Cloudflare Pages Git Integration
      ↓
自动 Production 部署
```

## GitHub 侧

核心工作流：

`.github/workflows/sync.yml`

行为：

- 每 6 小时检查一次 `cmliu/edgetunnel/main`
- 同步上游项目文件
- 保留本仓库自己的 `.github/` 自动化文件
- 同步前检查上游 `_worker.js` JavaScript 语法
- 使用 `.github/scripts/build-pages.sh` 做一次本地构建验证
- 上游无变化时不提交
- 上游有变化时提交到 `main`
- 不需要 Cloudflare API Token
- 不需要 GitHub PAT

### 60 天 scheduled workflow 保活

GitHub 会在公共仓库长时间没有 repository activity 时自动停用 scheduled workflow。

`sync.yml` 每次运行都会检查仓库最后一次提交时间：

- 28 天内有提交：不做任何保活
- 28 天无提交：更新 `.github/keepalive`
- 保活提交前缀：`[CF-Pages-Skip]`

Cloudflare Pages 支持这个前缀，因此保活提交不会触发 Pages 部署。

## Cloudflare Pages 推荐配置

如果现有 Pages 已经通过 GitHub 连接：

- Git repository：`luoxuhao/edgetunnel`
- Production branch：`main`
- Enable automatic production branch deployments：开启
- Preview branches：建议 None
- Framework preset：None
- Build command：`bash .github/scripts/build-pages.sh`
- Build output directory：`dist`
- Root directory：留空

保留原有：

- 环境变量（ADMIN、KEY、UUID、PROXYIP 等）
- Secrets
- KV 绑定
- 自定义域
- Compatibility date / Compatibility flags

### 为什么使用 dist/

不建议把仓库根目录 `.` 直接作为 Pages 输出目录。

构建脚本会把实际运行文件放进 `dist/`，避免 README、LICENSE、GitHub 工作流等仓库维护文件进入 Pages 部署输出。

当前 `_worker.js` 是单文件运行代码；脚本同时会自动复制未来新增的未知运行文件/目录，但排除明确的文档和仓库配置文件。

## Build watch paths

为了未来兼容性，建议先保持 Cloudflare 默认：

- Include paths：`*`
- Exclude paths：空

这样如果上游以后增加新的运行模块或资源，也能自动触发部署。

保活提交已经使用 `[CF-Pages-Skip]`，不会浪费 Pages 构建。

如果以后确认上游结构长期固定，再按需收紧 Build watch paths。

## 如果当前 Pages 是 Direct Upload

Direct Upload 项目不能直接改成 Git Integration。

需要新建 Pages Git 项目：

1. Workers & Pages → Create
2. Pages → Import an existing Git repository
3. 选择 `luoxuhao/edgetunnel`
4. Production branch：`main`
5. Framework preset：None
6. Build command：`bash .github/scripts/build-pages.sh`
7. Build output directory：`dist`
8. Root directory：留空
9. 部署成功后迁移旧项目的变量、Secrets、KV 和自定义域

先用新的 `*.pages.dev` 地址验证后台、订阅和节点，再迁移自定义域。

## 手动验证

GitHub：

`Actions → Sync upstream → Run workflow`

正常结果：

- 上游无变化：成功结束并显示 No upstream changes
- 上游有变化：自动提交 main

Cloudflare Pages 连好 GitHub 后，实际的上游更新提交应该紧接着触发 Production deployment。
