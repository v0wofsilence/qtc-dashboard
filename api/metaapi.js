export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.METAAPI_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'Missing METAAPI_TOKEN' });

  const MGMT = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
  const headers = { 'auth-token': TOKEN, 'Content-Type': 'application/json' };

  // POST: create-account
  if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'create-account') {
      try {
        var body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        var payload = {
          name: body.name,
          login: body.login,
          password: body.password,
          server: body.server,
          platform: body.platform || 'mt5',
          type: 'cloud-g2',
          magic: 0
        };
        var r = await fetch(MGMT + '/users/current/accounts', {
          method: 'POST', headers: headers, body: JSON.stringify(payload)
        });
        var data = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: data.message || JSON.stringify(data) });
        // Auto-deploy the account
        var deployR = await fetch(MGMT + '/users/current/accounts/' + data.id + '/deploy', {
          method: 'POST', headers: headers
        });
        if (!deployR.ok) {
          var dd = await deployR.json().catch(function(){ return {} });
          return res.status(200).json({ id: data.id, deployed: false, deployError: dd.message || 'Deploy failed' });
        }
        return res.status(200).json({ id: data.id, deployed: true });
      } catch (e) {
        return res.status(502).json({ error: 'Create account failed: ' + e.message });
      }
    }
    return res.status(400).json({ error: 'Unknown POST action' });
  }

  const { endpoint, accountId } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'Missing ?endpoint=' });

  const MGMT = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
  const headers = { 'auth-token': TOKEN };

  // List all connected accounts
  if (endpoint === 'list-accounts') {
    try {
      var r = await fetch(MGMT + '/users/current/accounts', { headers });
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      var accounts = await r.json();
      // Return simplified list
      var list = accounts.map(function(a) {
        return {
          id: a._id, name: a.name, login: a.login, server: a.server,
          platform: a.platform, state: a.state, connectionStatus: a.connectionStatus,
          region: a.region, type: a.type
        };
      });
      return res.status(200).json(list);
    } catch (e) {
      return res.status(502).json({ error: 'List accounts failed: ' + e.message });
    }
  }

  // All other endpoints require accountId
  if (!accountId) return res.status(400).json({ error: 'Missing ?accountId= parameter' });

  // Get account details to determine region
  var account;
  try {
    var ar = await fetch(MGMT + '/users/current/accounts/' + accountId, { headers });
    account = await ar.json();
    if (endpoint === 'account') return res.status(200).json(account);
  } catch (e) {
    return res.status(502).json({ error: 'Account fetch failed: ' + e.message });
  }

  var region = account.region || 'london';

  var clientBases = [
    'https://mt-client-api-v1.' + region + '.agiliumtrade.ai',
    'https://mt-client-api-v1.' + region + '.agiliumtrade.agiliumtrade.ai',
  ];

  var metastatsBases = [
    'https://metastats-api-v1.' + region + '.agiliumtrade.ai',
    'https://metastats-api-v1.' + region + '.agiliumtrade.agiliumtrade.ai',
  ];

  // MetaStats metrics
  if (endpoint === 'metrics') {
    for (var k = 0; k < metastatsBases.length; k++) {
      try {
        var mr = await fetch(metastatsBases[k] + '/users/current/accounts/' + accountId + '/metrics', { headers });
        if (mr.ok) return res.status(200).json(await mr.json());
      } catch (e) { /* next */ }
    }
    return res.status(502).json({ error: 'MetaStats unavailable' });
  }

  // Client API endpoints
  var now = new Date();
  var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  var ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  var paths = {
    'account-info': '/users/current/accounts/' + accountId + '/accountInformation',
    'positions': '/users/current/accounts/' + accountId + '/positions',
    'history': '/users/current/accounts/' + accountId + '/history-deals/time/' + thirtyDaysAgo.toISOString() + '/' + now.toISOString(),
    'history-90d': '/users/current/accounts/' + accountId + '/history-deals/time/' + ninetyDaysAgo.toISOString() + '/' + now.toISOString(),
  };

  var path = paths[endpoint];
  if (!path) return res.status(400).json({ error: 'Unknown endpoint: ' + endpoint });

  for (var i = 0; i < clientBases.length; i++) {
    try {
      var cr = await fetch(clientBases[i] + path, { headers });
      if (cr.ok) return res.status(200).json(await cr.json());
    } catch (e) { /* next */ }
  }

  return res.status(502).json({ error: 'All API URLs failed for ' + endpoint });
}
