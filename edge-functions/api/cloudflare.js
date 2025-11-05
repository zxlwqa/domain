import { neon } from '@neondatabase/serverless';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

async function logOperation(sql, action, details, status = 'success') {
  try {
    await sql`INSERT INTO logs (type, action, details, status, user_agent, ip_address) VALUES ('operation', ${action}, ${details}, ${status}, 'Edge', '127.0.0.1')`;
  } catch {
  }
}

async function fetchCloudflareDomains(apiKey) {
  const zones = [];
  let page = 1;
  const perPage = 50;
  while (true) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones?page=${page}&per_page=${perPage}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    if (!data.success) throw new Error('Cloudflare API 返回错误');
    zones.push(...data.result);
    if (data.result_info.count < perPage) break;
    page++;
  }
  const domains = zones.map((zone) => {
    const now = new Date();
    const expireDate = zone.expiration_date ? new Date(zone.expiration_date) : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    return {
      domain: zone.name,
      status: zone.status === 'active' ? 'active' : 'pending',
      registrar: 'Cloudflare',
      register_date: (zone.created_date || zone.created_on) ? (zone.created_date || zone.created_on).split('T')[0] : '',
      expire_date: expireDate.toISOString().split('T')[0],
      renewUrl: `https://dash.cloudflare.com/${zone.id}/domain`
    };
  });
  return domains;
}

export async function onRequest({ request, env }) {
  if (request.method.toUpperCase() !== 'POST') {
    return json({ success: false, error: 'Method Not Allowed' }, 405);
  }
  let sql;
  try { sql = neon(env.DATABASE_URL); } catch (e) { return json({ success: false, error: e.message }, 500); }
  try {
    const apiKey = (env && env.CF_KEY) || (typeof process !== 'undefined' && process.env ? process.env.CF_KEY : undefined);
    if (!apiKey) {
      await logOperation(sql, '导入Cloudflare域名', '缺少CF_KEY环境变量', 'error');
      return json({ success: false, error: '请在环境变量中添加CF_KEY' }, 400);
    }
    const cloudflareDomains = await fetchCloudflareDomains(apiKey);
    if (cloudflareDomains.length === 0) {
      await logOperation(sql, '导入Cloudflare域名', '未找到任何域名', 'warning');
      return json({ success: false, error: '未找到任何域名' }, 404);
    }
    await sql`DELETE FROM domains`;
    const d_domain = cloudflareDomains.map((d) => d.domain);
    const d_status = cloudflareDomains.map((d) => d.status);
    const d_registrar = cloudflareDomains.map((d) => d.registrar);
    const d_register = cloudflareDomains.map((d) => d.register_date);
    const d_expire = cloudflareDomains.map((d) => d.expire_date);
    const d_renew = cloudflareDomains.map((d) => d.renewUrl || null);
    if (d_domain.length > 0) {
      await sql`
        INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl)
        SELECT * FROM UNNEST(
          ${d_domain}::text[],
          ${d_status}::text[],
          ${d_registrar}::text[],
          ${d_register}::text[],
          ${d_expire}::text[],
          ${d_renew}::text[]
        )`;
    }
    const details = `成功导入 ${cloudflareDomains.length} 个域名`;
    await logOperation(sql, '导入Cloudflare域名', details, 'success');
    return json({ success: true, message: details, domains: cloudflareDomains, stats: { total: cloudflareDomains.length } });
  } catch (error) {
    const errorMessage = error.message || '导入失败';
    await logOperation(sql, '导入Cloudflare域名', `导入失败: ${errorMessage}`, 'error');
    return json({ success: false, error: errorMessage }, 500);
  }
}


