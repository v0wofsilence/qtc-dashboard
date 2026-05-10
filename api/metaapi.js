export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const TOKEN = process.env.METAAPI_TOKEN;
  const ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID;

  if (!TOKEN || !ACCOUNT_ID) {
    return res.status(500).json({ error: 'Missing METAAPI_TOKEN or METAAPI_ACCOUNT_ID environment variables' });
  }

  const { endpoint } = req.query;

  // Map endpoint names to MetaAPI URLs
  const MGMT = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

  // First get the account to determine region
  let region = 'london';
  try {
    const acctRes = await fetch(`${MGMT}/users/current/accounts/${ACCOUNT_ID}`, {
      headers: { 'auth-token': TOKEN }
    });
    if (acctRes.ok) {
      const acct = await acctRes.json();
      region = acct.region || 'london';

      if (endpoint === 'account') {
        return res.status(200).json(acct);
      }
    }
  } catch (e) {
    // Continue with default region
  }

  const CLIENT = `https://mt-client-api-v1.${region}.agiliumtrade.agiliumtrade.ai`;
  const METASTATS = `https://metastats-api-v1.${region}.agiliumtrade.agiliumtrade.ai`;

  const endpoints = {
    'account-info': `${CLIENT}/users/current/accounts/${ACCOUNT_ID}/accountInformation`,
    'positions': `${CLIENT}/users/current/accounts/${ACCOUNT_ID}/positions`,
    'history': `${CLIENT}/users/current/accounts/${ACCOUNT_ID}/history-deals/time/${new Date(Date.now() - 30*24*60*60*1000).toISOString()}/${new Date().toISOString()}`,
    'metrics': `${METASTATS}/users/current/accounts/${ACCOUNT_ID}/metrics`,
  };

  const url = endpoints[endpoint];
  if (!url) {
    return res.status(400).json({ error: `Unknown endpoint: ${endpoint}. Valid: ${Object.keys(endpoints).join(', ')}` });
  }

  try {
    const apiRes = await fetch(url, {
      headers: { 'auth-token': TOKEN }
    });

    const contentType = apiRes.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await apiRes.json();
      return res.status(apiRes.status).json(data);
    } else {
      const text = await apiRes.text();
      return res.status(apiRes.status).json({ raw: text });
    }
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
