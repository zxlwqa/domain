import { createErrorResponse, createSuccessResponse } from './common';

// 记录操作日志的函数
async function logOperation(env: any, action: string, details: string, status: 'success' | 'error' | 'warning' = 'success') {
  try {
    const userAgent = 'Server-Side';
    const ipAddress = '127.0.0.1';
    
    await env.DB.prepare(
      'INSERT INTO logs (type, action, details, status, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      'operation',
      action,
      details,
      status,
      userAgent,
      ipAddress
    ).run();
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
}

interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path: string;
}

interface BackupData {
  domains: any[];
  settings: any;
  timestamp: string;
  version: string;
}

// 将UTC时间转换为中国北京时区（UTC+8）
function toBeijingTime(utcTime: string): string {
  const date = new Date(utcTime);
  // 创建北京时区的时间（UTC+8）
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 获取当前中国北京时区时间
function getCurrentBeijingTime(): string {
  const now = new Date();
  // 创建北京时区的时间（UTC+8）
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export const onRequest = async (context: any) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'POST') {
    try {
      const body = await request.json();
      const { action, filename } = body;

      console.log('WebDAV请求:', { action, filename });

      if (!action) {
        await logOperation(env, 'WebDAV操作', '缺少操作类型', 'error');
        return createErrorResponse('缺少操作类型', 400);
      }

      // 从环境变量获取WebDAV配置
      const envUrl = env.WEBDAV_URL;
      const envUser = env.WEBDAV_USER;
      const envPass = env.WEBDAV_PASS;
      
      console.log('环境变量检查:', { 
        hasUrl: !!envUrl, 
        hasUser: !!envUser, 
        hasPass: !!envPass 
      });
      
      if (!envUrl || !envUser || !envPass) {
        await logOperation(env, 'WebDAV操作', 'WebDAV配置不完整，请在Cloudflare Pages环境变量中设置', 'error');
        return createErrorResponse('WebDAV配置不完整，请在Cloudflare Pages环境变量中设置', 400);
      }
      
      const config: WebDAVConfig = {
        url: envUrl,
        username: envUser,
        password: envPass,
        path: '/domain/domains.json'
      };
      console.log('使用环境变量WebDAV配置');

      if (action === 'backup') {
        return await handleBackup(env, config);
      } else if (action === 'restore') {
        return await handleRestore(env, config, filename);
      } else {
        await logOperation(env, 'WebDAV操作', `不支持的操作: ${action}`, 'error');
        return createErrorResponse('不支持的操作', 400);
      }
    } catch (e: any) {
      return createErrorResponse(e.message, 500);
    }
  }

  return createErrorResponse('Method Not Allowed', 405);
};

async function handleBackup(env: any, config: WebDAVConfig): Promise<Response> {
  try {
    // 获取域名数据
    const { results: domains } = await env.DB.prepare(
      'SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC'
    ).all();

    // 获取通知设置
    const { results: settings } = await env.DB.prepare(
      'SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1'
    ).all();

    const backupData: BackupData = {
      domains: domains || [],
      settings: settings?.[0] || {},
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    const backupContent = JSON.stringify(backupData, null, 2);
    const filename = 'domains.json';

    // 确保WebDAV URL格式正确
    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) {
      webdavUrl += '/';
    }

    // 确保domain文件夹存在
    const domainFolderUrl = new URL('domain/', webdavUrl).toString();
    const auth = btoa(`${config.username}:${config.password}`);

    // 尝试创建domain文件夹（如果不存在）
    try {
      const mkcolResponse = await fetch(domainFolderUrl, {
        method: 'MKCOL',
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });
      // 如果文件夹已存在，会返回405 Method Not Allowed，这是正常的
      if (!mkcolResponse.ok && mkcolResponse.status !== 405) {
        console.warn(`创建domain文件夹失败: ${mkcolResponse.status} ${mkcolResponse.statusText}`);
      }
    } catch (error) {
      console.warn('创建domain文件夹时出错:', error);
    }

    // 上传到WebDAV的domain文件夹，固定文件名为domains.json
    const uploadUrl = new URL(`domain/${filename}`, webdavUrl).toString();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': backupContent.length.toString()
      },
      body: backupContent
    });

    if (!uploadResponse.ok) {
      throw new Error(`WebDAV上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    // 记录备份成功日志
    await logOperation(env, 'WebDAV备份', `成功备份 ${domains?.length || 0} 个域名到 ${filename}`, 'success');

    return createSuccessResponse({
      success: true,
      message: '备份成功',
      filename,
      domainsCount: domains?.length || 0,
      timestamp: getCurrentBeijingTime()
    });
  } catch (error: any) {
    console.error('WebDAV备份错误:', error);
    // 记录备份失败日志
    await logOperation(env, 'WebDAV备份', `备份失败: ${error.message}`, 'error');
    return createErrorResponse(`备份失败: ${error.message}`, 500);
  }
}

async function handleRestore(env: any, config: WebDAVConfig, filename?: string): Promise<Response> {
  try {
    // 确保WebDAV URL格式正确
    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) {
      webdavUrl += '/';
    }

    // 使用固定的文件名domains.json
    const backupFilename = filename || 'domains.json';

    // 从WebDAV的domain文件夹下载备份文件
    const downloadUrl = new URL(`domain/${backupFilename}`, webdavUrl).toString();
    const auth = btoa(`${config.username}:${config.password}`);

    const downloadResponse = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    if (!downloadResponse.ok) {
      throw new Error(`WebDAV下载失败: ${downloadResponse.status} ${downloadResponse.statusText}`);
    }

    const backupContent = await downloadResponse.text();
    const backupData: BackupData = JSON.parse(backupContent);

    if (!backupData.domains || !Array.isArray(backupData.domains)) {
      throw new Error('备份文件格式错误');
    }

    // 清空现有数据
    await env.DB.exec('DELETE FROM domains');

    // 恢复域名数据
    for (const domain of backupData.domains) {
      await env.DB.prepare(
        'INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        domain.domain,
        domain.status,
        domain.registrar,
        domain.register_date,
        domain.expire_date,
        domain.renewUrl || null
      ).run();
    }

    // 恢复设置数据（如果存在）
    if (backupData.settings && Object.keys(backupData.settings).length > 0) {
      await env.DB.exec('DELETE FROM notification_settings');
      await env.DB.prepare(
        'INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES (?, ?, ?, ?)'
      ).bind(
        backupData.settings.warningDays || '15',
        backupData.settings.notificationEnabled || 'true',
        backupData.settings.notificationInterval || 'daily',
        backupData.settings.notificationMethod || '[]'
      ).run();
    }

    // 记录恢复成功日志
    await logOperation(env, 'WebDAV恢复', `成功恢复 ${backupData.domains.length} 个域名，备份时间: ${toBeijingTime(backupData.timestamp)}`, 'success');

    return createSuccessResponse({
      success: true,
      message: '恢复成功',
      domainsCount: backupData.domains.length,
      timestamp: toBeijingTime(backupData.timestamp)
    });
  } catch (error: any) {
    console.error('WebDAV恢复错误:', error);
    // 记录恢复失败日志
    await logOperation(env, 'WebDAV恢复', `恢复失败: ${error.message}`, 'error');
    return createErrorResponse(`恢复失败: ${error.message}`, 500);
  }
}
