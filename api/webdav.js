import { getDB, initializeDatabase } from './_lib/db.js';

function getCurrentBeijingTime() {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
function toBeijingTime(utcTime) {
  const date = new Date(utcTime);
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
  if (req.method?.toUpperCase() !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return res.status(500).json({ success: false, error: '数据库初始化失败' });
  }
  try {
    const { action, filename } = req.body;
    if (!action) {
      await logOperation('WebDAV操作', '缺少操作类型', 'error');
      return res.status(400).json({ success: false, error: '缺少操作类型' });
    }
    const envUrl = process.env.WEBDAV_URL;
    const envUser = process.env.WEBDAV_USER;
    const envPass = process.env.WEBDAV_PASS;
    if (!envUrl || !envUser || !envPass) {
      await logOperation('WebDAV操作', 'WebDAV配置不完整，请在Vercel环境变量中设置', 'error');
      return res.status(400).json({ success: false, error: 'WebDAV配置不完整，请在Vercel环境变量中设置' });
    }
    const config = { url: envUrl, username: envUser, password: envPass, path: '/domain/domains.json' };
    if (action === 'backup') {
      return await handleBackup(res, config);
    } else if (action === 'restore') {
      return await handleRestore(res, config, filename);
    } else {
      await logOperation('WebDAV操作', `不支持的操作: ${action}`, 'error');
      return res.status(400).json({ success: false, error: '不支持的操作' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
async function handleBackup(res, config) {
  try {
    const db = await getDB();
    const domainsResult = await db.query('SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC');
    const settingsResult = await db.query('SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1');
    const backupData = {
      domains: domainsResult.rows || [],
      settings: settingsResult.rows?.[0] || {},
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    const backupContent = JSON.stringify(backupData, null, 2);
    const filename = 'domains.json';
    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) { webdavUrl += '/'; }
    const domainFolderUrl = new URL('domain/', webdavUrl).toString();
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    try {
      const mkcolResponse = await fetch(domainFolderUrl, {
        method: 'MKCOL',
        headers: { 'Authorization': `Basic ${auth}` }
      });
      if (!mkcolResponse.ok && mkcolResponse.status !== 405) {
        console.warn(`创建domain文件夹失败: ${mkcolResponse.status} ${mkcolResponse.statusText}`);
      }
    } catch (error) { console.warn('创建domain文件夹时出错:', error); }
    const uploadUrl = new URL(`domain/${filename}`, webdavUrl).toString();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Content-Length': backupContent.length.toString() },
      body: backupContent
    });
    if (!uploadResponse.ok) {
      throw new Error(`WebDAV上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
    await logOperation('WebDAV备份', `成功备份 ${domainsResult.rows.length} 个域名到 ${filename}`, 'success');
    return res.json({ success: true, message: '备份成功', filename, domainsCount: domainsResult.rows.length, timestamp: getCurrentBeijingTime() });
  } catch (error) {
    console.error('WebDAV备份错误:', error);
    await logOperation('WebDAV备份', `备份失败: ${error.message}`, 'error');
    return res.status(500).json({ success: false, error: `备份失败: ${error.message}` });
  }
}
async function handleRestore(res, config, filename) {
  try {
    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) { webdavUrl += '/'; }
    const backupFilename = filename || 'domains.json';
    const downloadUrl = new URL(`domain/${backupFilename}`, webdavUrl).toString();
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const downloadResponse = await fetch(downloadUrl, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` }
    });
    if (!downloadResponse.ok) {
      throw new Error(`WebDAV下载失败: ${downloadResponse.status} ${downloadResponse.statusText}`);
    }
    const backupContent = await downloadResponse.text();
    const backupData = JSON.parse(backupContent);
    if (!backupData.domains || !Array.isArray(backupData.domains)) {
      throw new Error('备份文件格式错误');
    }
    const db = await getDB();
    await db.query('DELETE FROM domains');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const domain of backupData.domains) {
        await client.query('INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES ($1, $2, $3, $4, $5, $6)', [domain.domain, domain.status, domain.registrar, domain.register_date, domain.expire_date, domain.renewUrl || null]);
      }
      if (backupData.settings && Object.keys(backupData.settings).length > 0) {
        await client.query('DELETE FROM notification_settings');
        await client.query('INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES ($1, $2, $3, $4)', [backupData.settings.warningDays || '15', backupData.settings.notificationEnabled || 'true', backupData.settings.notificationInterval || 'daily', backupData.settings.notificationMethod || '[]']);
      }
      await client.query('COMMIT');
      await logOperation('WebDAV恢复', `成功恢复 ${backupData.domains.length} 个域名，备份时间: ${toBeijingTime(backupData.timestamp)}`, 'success');
      return res.json({ success: true, message: '恢复成功', domainsCount: backupData.domains.length, timestamp: toBeijingTime(backupData.timestamp) });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('WebDAV恢复错误:', error);
    await logOperation('WebDAV恢复', `恢复失败: ${error.message}`, 'error');
    return res.status(500).json({ success: false, error: `恢复失败: ${error.message}` });
  }
}
