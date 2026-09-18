// Deploy as a SEPARATE Worker; never paste this over the edgetunnel application.
export async function dispatch(env, fetcher = fetch) {
  if (!env.GITHUB_TOKEN) throw new Error('Missing GITHUB_TOKEN secret');
  const base = 'https://api.github.com/repos/luoxuhao/edgetunnel/actions/workflows/sync.yml';
  const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json', 'User-Agent': 'edgetunnel-scheduler', 'X-GitHub-Api-Version': '2022-11-28' };
  const call = async (url, method = 'GET', body) => {
    const response = await fetcher(url, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`GitHub ${response.status} (${method}); check token permissions and workflow status`);
    return response.status === 204 ? null : response.json();
  };
  const workflow = await call(base);
  if (workflow.state === 'disabled_manually') {
    console.log('Workflow manually disabled; respecting pause.');
    return;
  }
  if (workflow.state === 'disabled_inactivity') await call(base + '/enable', 'PUT');
  else if (workflow.state !== 'active') throw new Error(`Workflow is not active: ${workflow.state}`);
  await call(base + '/dispatches', 'POST', { ref: 'main' });
  console.log('Update requested; inspect GitHub Actions for deployment result.');
}
export default {
  async scheduled(_event, env) { await dispatch(env); },
  fetch() { return new Response('Not found', { status: 404 }); }
};
