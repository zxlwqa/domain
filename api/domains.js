import { getDB, initializeDatabase } from './_lib/db.js';

function createErrorResponse(res, error, status = 500) {
  return res.status(status).json({ success: false, error });
}
function createSuccessResponse(res, data = { success: true }) {
  return res.json(data);
}
async function logOperation(action, details, status = 'success') {
  try {
    const db = await getDB();
    await db.query(
      'INSERT INTO logs (type, action, details, status, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      ['operation', action, details, status, 'Server-Side', '127.0.0.1']
    );
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
}
export default async function handler(req, res) {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return createErrorResponse(res, '数据库初始化失败', 500);
  }
  const method = req.method?.toUpperCase();
  if (method === 'GET') {
    try {
      const db = await getDB();
      const result = await db.query('SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC');
      return createSuccessResponse(res, { success: true, domains: result.rows });
    } catch (e) {
      return createErrorResponse(res, e.message, 500);
    }
  }
  if (method === 'POST') {
    try {
      const body = req.body;
      if (!Array.isArray(body.domains)) {
        await logOperation('添加域名', '数据格式错误', 'error');
        return createErrorResponse(res, '数据格式错误', 400);
      }
      const db = await getDB();
      const existingResult = await db.query('SELECT domain FROM domains');
      const existingDomainNames = existingResult.rows.map((d) => d.domain);
      const newDomains = body.domains.filter((d) => !existingDomainNames.includes(d.domain));
      const updatedDomains = body.domains.filter((d) => existingDomainNames.includes(d.domain));
      const domainsToDelete = existingDomainNames.filter((domain) => !body.domains.some((d) => d.domain === domain));
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const domain of domainsToDelete) {
          await client.query('DELETE FROM domains WHERE domain = $1', [domain]);
        }
        for (const d of body.domains) {
          await client.query(
            `INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) \
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (domain) DO UPDATE SET \
               status = EXCLUDED.status,\
               registrar = EXCLUDED.registrar,\
               register_date = EXCLUDED.register_date,\
               expire_date = EXCLUDED.expire_date,\
               renewUrl = EXCLUDED.renewUrl`,
            [d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl || null]
          );
        }
        await client.query('COMMIT');
        if (newDomains.length > 0) {
          await logOperation('添加域名', `成功添加 ${newDomains.length} 个新域名: ${newDomains.map((d) => d.domain).join(', ')}`, 'success');
        }
        if (updatedDomains.length > 0) {
          await logOperation('更新域名', `成功更新 ${updatedDomains.length} 个域名: ${updatedDomains.map((d) => d.domain).join(', ')}`, 'success');
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return createSuccessResponse(res, { success: true, message: '数据保存成功' });
    } catch (e) {
      await logOperation('添加域名', `保存失败: ${e.message}`, 'error');
      return createErrorResponse(res, e.message, 500);
    }
  }
  if (method === 'DELETE') {
    try {
      const { domain } = req.body;
      if (!domain) {
        await logOperation('删除域名', '缺少域名参数', 'error');
        return createErrorResponse(res, '缺少参数', 400);
      }
      const db = await getDB();
      const result = await db.query('SELECT domain FROM domains WHERE domain = $1', [domain]);
      if (result.rows.length === 0) {
        await logOperation('删除域名', `域名不存在: ${domain}`, 'warning');
        return createErrorResponse(res, '域名不存在', 404);
      }
      await db.query('DELETE FROM domains WHERE domain = $1', [domain]);
      await logOperation('删除域名', `成功删除域名: ${domain}`, 'success');
      return createSuccessResponse(res, { success: true, message: '删除成功' });
    } catch (e) {
      await logOperation('删除域名', `删除失败: ${e.message}`, 'error');
      return createErrorResponse(res, e.message, 500);
    }
  }
  return createErrorResponse(res, 'Method Not Allowed', 405);
}
