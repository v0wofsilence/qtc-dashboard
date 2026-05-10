export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.METAAPI_TOKEN;
  const ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID;

  if (!TOKEN || !ACCOUNT_ID) {
    return res.status(500).json({ error: 'Missing env vars', hasToken: !!TOKEN, hasAccountId: !!ACCOUNT_ID });
  }

  const { endpoint } = req.query;
  if (!endpoint) {
    return res.status(400).json({ error: 'Add ?endpoint= parameter. Valid: account, account-info, positions, history, metrics, debug' });
  }

  const MGMT = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
  const headers = { 'auth-token': TOKEN };

  let account;
  try {
    const r = await fetch(MGMT + '/users/current/accounts/' + ACCOUNT_ID, { headers });
    account = await r.json();
    if (endpoint === 'account') return res.status(200).json(account);
  } catch (e) {
    return res.status(502).json({ error: 'Provisioning API failed: ' + e.message });
  }

  const region = account.region || 'london';

  const clientBases = [
    'https://mt-client-api-v1.' + region + '.agiliumtrade.agiliumtrade.ai',
    'https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai',
    'https://mt-client-api-v1.' + region + '.agiliumtrade.ai',
  ];

  const metastatsBases = [
    'https://metastats-api-v1.' + region + '.agiliumtrade.agiliumtrade.ai',
    'https://metastats-api-v1.agiliumtrade.agiliumtrade.ai',
  ];

  if (endpoint === 'debug') {
    var results = [];
    for (var i = 0; i < clientBases.length; i++) {
      var url = clientBases[i] + '/users/current/accounts/' + ACCOUNT_ID + '/accountInformation';
      try {
        var r = await fetch(url, { headers });
        var body = await r.text();
        results.push({ url: url, status: r.status, body: body.slice(0, 500) });
      } catch (e) {
        results.push({ url: url, error: e.message });
      }
    }
    for (var j = 0; j < metastatsBases.length; j++) {
      var murl = metastatsBases[j] + '/users/current/accounts/' + ACCOUNT_ID + '/metrics';
      try {
        var mr = await fetch(murl, { headers });
        var mbody = await mr.text();
        results.push({ url: murl, status: mr.status, body: mbody.slice(0, 500) });
      } catch (e) {
        results.push({ url: murl, error: e.message });
      }
    }
    return res.status(200).json({
      account: { type: account.type, region: region, state: account.state, conn: account.connectionStatus },
      results: results
    });
  }

  if (endpoint === 'metrics') {
    for (var k = 0; k < metastatsBases.length; k++) {
      var msurl = metastatsBases[k] + '/users/current/accounts/' + ACCOUNT_ID + '/metrics';
      try {
        var msr = await fetch(msurl, { headers });
        if (msr.ok) {
          var msdata = await msr.json();
          return res.status(200).json(msdata);
        }
      } catch (e) { /* try next */ }
    }
    return res.status(502).json({ error: 'All MetaStats URLs failed' });
  }

  var paths = {
    'account-info': '/users/current/accounts/' + ACCOUNT_ID + '/accountInformation',
    'positions': '/users/current/accounts/' + ACCOUNT_ID + '/positions',
    'history': '/users/current/accounts/' + ACCOUNT_ID + '/history-deals/time/' + new Date(Date.now() - 30*24*60*60*1000).toISOString() + '/' + new Date().toISOString(),
  };

  var path = paths[endpoint];
  if (!path) {
    return res.status(400).json({ error: 'Unknown endpoint: ' + endpoint });
  }

  var errors = [];
  for (var m = 0; m < clientBases.length; m++) {
    var curl = clientBases[m] + path;
    try {
      var cr = await fetch(curl, { headers });
      if (cr.ok) {
        var cdata = await cr.json();
        return res.status(200).json(cdata);
      } else {
        var cbody = await cr.text();
        errors.push({ url: clientBases[m], status: cr.status, body: cbody.slice(0, 300) });
      }
    } catch (e) {
      errors.push({ url: clientBases[m], error: e.message });
    }
  }

  return res.status(502).json({ error: 'All URLs failed', attempts: errors });
}
