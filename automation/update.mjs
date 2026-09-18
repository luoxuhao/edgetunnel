import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const files = ['_worker.js', 'LICENSE', 'CHANGELOG'];
const statePath = 'automation/deployed.json';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
export async function request(url, options = {}, fetcher = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(30000) });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) throw new Error(`HTTP ${response.status}: ${new URL(url).pathname}`);
      if (attempt === 2) throw new Error(`HTTP ${response.status}: ${new URL(url).pathname}`);
    } catch (error) {
      if (attempt === 2 || /^HTTP (?!429)4/.test(error.message)) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}
export function fingerprint(source, account, project) {
  return createHash('sha256').update(JSON.stringify([source, account, project, 'wrangler-4.135.0'])).digest('hex');
}
export function confirmedDeployment(candidate, source, previousId) {
  return Boolean(candidate?.id && candidate.id !== previousId && candidate.environment === 'production' &&
    candidate.deployment_trigger?.metadata?.commit_hash === source && candidate.latest_stage?.status === 'success');
}
export function needsDeployment(previous, digest, liveId, force) {
  return force || previous.fingerprint !== digest || !previous.deploymentId || previous.deploymentId !== liveId;
}
async function main() {
  const { CF_PROJECT: project, CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, GH_TOKEN: gh } = process.env;
  if (!project || !/^[a-z0-9-]+$/.test(project) || !/^[a-f0-9]{32}$/i.test(account || '') || !token || !gh) {
    throw new Error('Configure CF_PAGES_PROJECT and CLOUDFLARE_ACCOUNT_ID variables, and CLOUDFLARE_API_TOKEN secret first.');
  }
  const cfBase = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}`;
  const cfOptions = { headers: { Authorization: `Bearer ${token}` } };
  const cf = async path => {
    const data = await (await request(cfBase + path, cfOptions)).json();
    if (!data.success) throw new Error('Cloudflare API reported failure');
    return data.result;
  };
  const config = await cf('');
  if (config.production_branch !== 'main') throw new Error('Pages production branch must be main.');
  if (config.source?.config?.production_deployments_enabled !== false && config.source?.type === 'github') {
    throw new Error('Disable automatic production deployments in Pages branch controls first, to avoid competing deployments.');
  }
  const headers = { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json', 'User-Agent': 'edgetunnel-updater' };
  const upstream = await (await request('https://api.github.com/repos/cmliu/edgetunnel/commits/main', { headers })).json();
  if (!/^[a-f0-9]{40}$/.test(upstream.sha)) throw new Error('Invalid upstream commit');
  // Fetch all inputs from one immutable commit before touching tracked files.
  const downloaded = new Map();
  for (const file of files) {
    const content = await (await request(`https://raw.githubusercontent.com/cmliu/edgetunnel/${upstream.sha}/${file}`)).text();
    if (!content.trim()) throw new Error(`Empty upstream file: ${file}`);
    downloaded.set(file, content);
  }
  const temp = mkdtempSync(join(tmpdir(), 'edgetunnel-'));
  writeFileSync(join(temp, 'check.mjs'), downloaded.get('_worker.js'));
  execFileSync(process.execPath, ['--check', join(temp, 'check.mjs')], { stdio: 'inherit' });
  for (const [file, content] of downloaded) writeFileSync(file, content);
  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('add', '--', ...files);
  if (git('diff', '--cached', '--name-only')) {
    git('commit', '-m', `Update edgetunnel from ${upstream.sha.slice(0, 12)} [skip ci]`);
    git('push', 'origin', 'HEAD:main');
  }
  const source = git('rev-parse', 'HEAD');
  const digest = fingerprint(downloaded.get('_worker.js'), account, project);
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const current = await cf('');
  if (!needsDeployment(previous, digest, current.canonical_deployment?.id, process.env.FORCE_DEPLOY === 'true')) {
    console.log('Source unchanged and recorded production deployment is still live.');
    return;
  }
  // Run outside the repo so the upstream Workers wrangler.toml cannot override Pages settings.
  const dist = join(temp, 'dist');
  mkdirSync(dist);
  copyFileSync('_worker.js', join(dist, '_worker.js'));
  execFileSync('npx', ['--yes', 'wrangler@4.135.0', 'pages', 'deploy', dist,
    '--project-name', project, '--branch', 'main', '--commit-hash', source, '--commit-dirty=true'],
    { cwd: temp, stdio: 'inherit', timeout: 600000 });
  // Do not record success merely because an upload was accepted.
  let deployment;
  for (let attempt = 0; attempt < 24; attempt++) {
    const result = await cf('');
    const candidate = result.canonical_deployment;
    if (confirmedDeployment(candidate, source, current.canonical_deployment?.id)) {
      deployment = candidate;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (!deployment) throw new Error('Could not confirm the new production deployment. Next invocation will retry.');
  mkdirSync('automation', { recursive: true });
  writeFileSync(statePath, JSON.stringify({ fingerprint: digest, deploymentId: deployment.id, upstream: upstream.sha, source }, null, 2) + '\n');
  git('add', '--', statePath);
  git('commit', '-m', 'Record successful Pages deployment [skip ci]');
  git('push', 'origin', 'HEAD:main');
  console.log(`Pages deployment confirmed: ${deployment.id}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
