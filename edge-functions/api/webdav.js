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

export async function onRequest({ request, env }) {
  if (request.method.toUpperCase() !== 'POST') {
    return json({ success: false, error: 'Method Not Allowed' }, 405);
  }
  let sql;
  try { sql = neon(env.DATABASE_URL); } catch (e) { return json({ success: false, error: e.message }, 500); }
  try {
    const { action, filename } = await request.json();
    if (!action) {
      await logOperation(sql, 'WebDAV操作', '缺少操作类型', 'error');
      return json({ success: false, error: '缺少操作类型' }, 400);
    }
    const getEnv = (k) => (env && env[k]) || (typeof process !== 'undefined' && process.env ? process.env[k] : undefined);
    const envUrl = getEnv('WEBDAV_URL');
    const envUser = getEnv('WEBDAV_USER');
    const envPass = getEnv('WEBDAV_PASS');
    if (!envUrl || !envUser || !envPass) {
      await logOperation(sql, 'WebDAV操作', 'WebDAV配置不完整，请设置环境变量', 'error');
      return json({ success: false, error: 'WebDAV配置不完整，请设置环境变量' }, 400);
    }
    const config = { url: envUrl, username: envUser, password: envPass, path: '/domain/domains.json' };
    if (action === 'backup') {
      return await handleBackup(sql, config);
    } else if (action === 'restore') {
      return await handleRestore(sql, config, filename);
    } else {
      await logOperation(sql, 'WebDAV操作', `不支持的操作: ${action}`, 'error');
      return json({ success: false, error: '不支持的操作' }, 400);
    }
  } catch (e) {
    return json({ success: false, error: String(e.message || e) }, 500);
  }
}

async function handleBackup(sql, config) {
  try {
    const domains = await sql`SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC`;
    const settings = await sql`SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1`;
    const backupData = {
      domains: domains || [],
      settings: settings?.[0] || {},
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    const backupContent = JSON.stringify(backupData, null, 2);
    const filename = 'domains.json';
    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) { webdavUrl += '/'; }
    const domainFolderUrl = new URL('domain/', webdavUrl).toString();
    const auth = btoa(`${config.username}:${config.password}`);
    try {
      const mkcolResponse = await fetch(domainFolderUrl, { method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } });
      if (!mkcolResponse.ok && mkcolResponse.status !== 405) {
        console.warn(`创建domain文件夹失败: ${mkcolResponse.status} ${mkcolResponse.statusText}`);
      }
    } catch (error) { console.warn('创建domain文件夹时出错:', error); }
    const uploadUrl = new URL(`domain/${filename}`, webdavUrl).toString();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Content-Length': String(backupContent.length) }, body: backupContent
    });
    if (!uploadResponse.ok) throw new Error(`WebDAV上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`);
    await logOperation(sql, 'WebDAV备份', `成功备份 ${domains.length} 个域名到 ${filename}`, 'success');
    return json({ success: true, message: '备份成功', filename, domainsCount: domains.length, timestamp: getCurrentBeijingTime() });
  } catch (error) {
    await logOperation(sql, 'WebDAV备份', `备份失败: ${error.message}`, 'error');
    return json({ success: false, error: `备份失败: ${error.message}` }, 500);
  }
}

async function handleRestore(sql, config, filename) {
  try {
    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) { webdavUrl += '/'; }
    const backupFilename = filename || 'domains.json';
    const downloadUrl = new URL(`domain/${backupFilename}`, webdavUrl).toString();
    const auth = btoa(`${config.username}:${config.password}`);
    const downloadResponse = await fetch(downloadUrl, { method: 'GET', headers: { 'Authorization': `Basic ${auth}` } });
    if (!downloadResponse.ok) throw new Error(`WebDAV下载失败: ${downloadResponse.status} ${downloadResponse.statusText}`);
    const backupContent = await downloadResponse.text();
    const backupData = JSON.parse(backupContent);
    if (!backupData.domains || !Array.isArray(backupData.domains)) throw new Error('备份文件格式错误');

    await sql`DELETE FROM domains`;
    if (backupData.domains.length > 0) {
      const d_domain = backupData.domains.map((d) => d.domain);
      const d_status = backupData.domains.map((d) => d.status);
      const d_registrar = backupData.domains.map((d) => d.registrar);
      const d_register = backupData.domains.map((d) => d.register_date);
      const d_expire = backupData.domains.map((d) => d.expire_date);
      const d_renew = backupData.domains.map((d) => d.renewUrl || null);
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
    if (backupData.settings && Object.keys(backupData.settings).length > 0) {
      await sql`DELETE FROM notification_settings`;
      await sql`INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES (${backupData.settings.warningDays || '15'}, ${backupData.settings.notificationEnabled || 'true'}, ${backupData.settings.notificationInterval || 'daily'}, ${backupData.settings.notificationMethod || '[]'})`;
    }
    await logOperation(sql, 'WebDAV恢复', `成功恢复 ${backupData.domains.length} 个域名，备份时间: ${toBeijingTime(backupData.timestamp)}`, 'success');
    return json({ success: true, message: '恢复成功', domainsCount: backupData.domains.length, timestamp: toBeijingTime(backupData.timestamp) });
  } catch (error) {
    await logOperation(sql, 'WebDAV恢复', `恢复失败: ${error.message}`, 'error');
    return json({ success: false, error: `恢复失败: ${error.message}` }, 500);
  }
}


