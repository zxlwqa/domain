import { getDB, initializeDatabase } from './_lib/db.js';

export default async function handler(req, res) {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return res.status(500).json({ success: false, error: '数据库初始化失败' });
  }
  const method = req.method?.toUpperCase();
  if (method === 'GET') {
    try {
      const db = await getDB();
      const type = req.query.type || 'all';
      const limit = parseInt(req.query.limit || '50');
      const offset = parseInt(req.query.offset || '0');
      let query = '';
      let params = [];
      if (type === 'all') {
        query = 'SELECT * FROM logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2';
        params = [limit, offset];
      } else {
        query = 'SELECT * FROM logs WHERE type = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3';
        params = [type, limit, offset];
      }
      const result = await db.query(query, params);
      return res.json({
        success: true,
        logs: result.rows,
        pagination: {
          limit,
          offset,
          total: result.rows.length
        }
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
  if (method === 'POST') {
    try {
      const db = await getDB();
      const { type, action, details, status, domain, notification_method, error_details, device_info } = req.body;
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = (req.headers['x-forwarded-for']||'').split(',')[0] || req.headers['x-real-ip'] || '';
      await db.query(
        'INSERT INTO logs (type, action, details, status, user_agent, ip_address, device_info, domain, notification_method, error_details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [type, action, details, status, userAgent, ipAddress, device_info || null, domain || null, notification_method || null, error_details || null]
      );
      return res.json({ success: true, message: '日志记录成功' });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
  if (method === 'DELETE') {
    try {
      const db = await getDB();
      const type = req.query.type;
      if (type && type !== 'all') {
        await db.query('DELETE FROM logs WHERE type = $1', [type]);
      } else {
        await db.query('DELETE FROM logs');
      }
      return res.json({ success: true, message: '日志清理成功' });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
  return res.status(405).json({ success: false, error: '不支持的请求方法' });
}
