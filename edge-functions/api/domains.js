import { neon, neonConfig } from '@neondatabase/serverless';

let cachedDomains = null;
let cachedAtMs = 0;
const CACHE_TTL_MS = 60 * 1000;

function json(data, init = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status: typeof init === 'number' ? init : init.status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', ...headers },
  });
}

async function logOperation(sql, env, action, details, status = 'success') {
  try { console.log('[domains]', status, action, details); } catch {
  }
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }
  let sql;
  try {
    try { neonConfig.fetchConnectionCache = true; } catch {
    }
    sql = neon(env.DATABASE_URL);
  } catch (e) { return json({ success: false, error: e.message }, 500); }
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    try {
      const withRetry = async (fn, attempts = 3) => {
        let lastErr;
        for (let i = 0; i < attempts; i++) {
          try { return await fn(); } catch (err) {
            lastErr = err;
            await new Promise(r => setTimeout(r, 150 * (i + 1)));
          }
        }
        throw lastErr;
      };
      const rows = await withRetry(() => sql`SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC`);
      cachedDomains = rows;
      cachedAtMs = Date.now();
      return json(
        { success: true, domains: rows },
        200,
        { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' }
      );
    } catch (e) {
      if (cachedDomains && Date.now() - cachedAtMs < CACHE_TTL_MS) {
        return json({ success: true, domains: cachedDomains }, 200, { 'x-stale': '1' });
      }
      return json({ success: false, error: String(e.message || e) }, 500);
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      if (!Array.isArray(body.domains)) {
        await logOperation(sql, env, '添加域名', '数据格式错误', 'error');
        return json({ success: false, error: '数据格式错误' }, 400);
      }
      const d_domain = body.domains.map((d) => d.domain);
      const d_status = body.domains.map((d) => d.status);
      const d_registrar = body.domains.map((d) => d.registrar);
      const d_register = body.domains.map((d) => d.register_date);
      const d_expire = body.domains.map((d) => d.expire_date);
      const d_renew = body.domains.map((d) => d.renewUrl || null);

      if (d_domain.length > 0) {
        await sql`DELETE FROM domains WHERE domain NOT IN (SELECT * FROM UNNEST(${d_domain}::text[]))`;
        await sql`
          INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl)
          SELECT * FROM UNNEST(
            ${d_domain}::text[],
            ${d_status}::text[],
            ${d_registrar}::text[],
            ${d_register}::text[],
            ${d_expire}::text[],
            ${d_renew}::text[]
          )
          ON CONFLICT (domain) DO UPDATE SET
            status = EXCLUDED.status,
            registrar = EXCLUDED.registrar,
            register_date = EXCLUDED.register_date,
            expire_date = EXCLUDED.expire_date,
            renewUrl = EXCLUDED.renewUrl`;
      } else {
        await sql`DELETE FROM domains`;
      }
      return json({ success: true, message: '数据保存成功' });
    } catch (e) {
      await logOperation(sql, env, '添加域名', `保存失败: ${e.message || e}`, 'error');
      return json({ success: false, error: String(e.message || e) }, 500);
    }
  }

  if (method === 'DELETE') {
    try {
      const { domain } = await request.json();
      if (!domain) {
        await logOperation(sql, env, '删除域名', '缺少域名参数', 'error');
        return json({ success: false, error: '缺少参数' }, 400);
      }
      const rows = await sql`SELECT domain FROM domains WHERE domain = ${domain}`;
      if (!rows.length) {
        await logOperation(sql, env, '删除域名', `域名不存在: ${domain}`, 'warning');
        return json({ success: false, error: '域名不存在' }, 404);
      }
      await sql`DELETE FROM domains WHERE domain = ${domain}`;
      await logOperation(sql, env, '删除域名', `成功删除域名: ${domain}`, 'success');
      return json({ success: true, message: '删除成功' });
    } catch (e) {
      await logOperation(sql, env, '删除域名', `删除失败: ${e.message || e}`, 'error');
      return json({ success: false, error: String(e.message || e) }, 500);
    }
  }

  return json({ success: false, error: 'Method Not Allowed' }, 405);
}


