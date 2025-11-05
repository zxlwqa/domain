import { neon } from '@neondatabase/serverless';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }
  let sql;
  try { sql = neon(env.DATABASE_URL); } catch (e) { return json({ success: false, error: e.message }, 500); }
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const type = url.searchParams.get('type') || 'all';
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      let rows = [];
      if (type === 'all') {
        rows = await sql`SELECT * FROM logs ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      } else {
        rows = await sql`SELECT * FROM logs WHERE type = ${type} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      }
      return json({ success: true, logs: rows, pagination: { limit, offset, total: rows.length } });
    } catch (e) {
      return json({ success: false, error: String(e.message || e) }, 500);
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      const userAgent = request.headers.get('user-agent') || '';
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '';
      const { type, action, details, status, domain, notification_method, error_details, device_info } = body;
      await sql`INSERT INTO logs (type, action, details, status, user_agent, ip_address, device_info, domain, notification_method, error_details)
                VALUES (${type}, ${action}, ${details}, ${status}, ${userAgent}, ${ipAddress}, ${device_info || null}, ${domain || null}, ${notification_method || null}, ${error_details || null})`;
      return json({ success: true, message: '日志记录成功' });
    } catch (e) {
      return json({ success: false, error: String(e.message || e) }, 500);
    }
  }

  if (method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      if (type && type !== 'all') {
        await sql`DELETE FROM logs WHERE type = ${type}`;
      } else {
        await sql`DELETE FROM logs`;
      }
      return json({ success: true, message: '日志清理成功' });
    } catch (e) {
      return json({ success: false, error: String(e.message || e) }, 500);
    }
  }

  return json({ success: false, error: '不支持的请求方法' }, 405);
}


