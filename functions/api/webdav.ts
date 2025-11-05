import { createErrorResponse, createSuccessResponse, CloudflareEnv } from './common';
import type { CloudflareContext } from './types';

async function logOperation(env: CloudflareEnv, action: string, details: string, status: 'success' | 'error' | 'warning' = 'success') {
  try {
    const userAgent = 'Server-Side';
    const ipAddress = '127.0.0.1';
    
    await env.DOMAIN.prepare(
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
  domains: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  timestamp: string;
  version: string;
}

function toBeijingTime(utcTime: string): string {
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

function getCurrentBeijingTime(): string {
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

export const onRequest = async (context: CloudflareContext) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'POST') {
    try {
      const body = await request.json();
      const { action, filename } = body;

      if (!action) {
        await logOperation(env, 'WebDAV操作', '缺少操作类型', 'error');
        return createErrorResponse('缺少操作类型', 400);
      }
      const envUrl = env.WEBDAV_URL;
      const envUser = env.WEBDAV_USER;
      const envPass = env.WEBDAV_PASS;
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

      if (action === 'backup') {
        return await handleBackup(env, config);
      } else if (action === 'restore') {
        return await handleRestore(env, config, filename);
      } else {
        await logOperation(env, 'WebDAV操作', `不支持的操作: ${action}`, 'error');
        return createErrorResponse('不支持的操作', 400);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      return createErrorResponse(errorMessage, 500);
    }
  }

  return createErrorResponse('Method Not Allowed', 405);
};

async function handleBackup(env: CloudflareEnv, config: WebDAVConfig): Promise<Response> {
  try {
    const { results: domains } = await env.DOMAIN.prepare(
      'SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC'
    ).all() as { results: Array<Record<string, unknown>> };
    const { results: settings } = await env.DOMAIN.prepare(
      'SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1'
    ).all() as { results: Array<Record<string, unknown>> };

    const backupData: BackupData = {
      domains: domains || [],
      settings: (settings?.[0] as Record<string, unknown>) || {},
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    const backupContent = JSON.stringify(backupData, null, 2);
    const filename = 'domains.json';

    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) {
      webdavUrl += '/';
    }
    const domainFolderUrl = new URL('domain/', webdavUrl).toString();
    const auth = btoa(`${config.username}:${config.password}`);
    try {
      const mkcolResponse = await fetch(domainFolderUrl, {
        method: 'MKCOL',
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });
      if (!mkcolResponse.ok && mkcolResponse.status !== 405) {
        console.warn(`创建domain文件夹失败: ${mkcolResponse.status} ${mkcolResponse.statusText}`);
      }
    } catch (error) {
      console.warn('创建domain文件夹时出错:', error);
    }
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

    await logOperation(env, 'WebDAV备份', `成功备份 ${domains?.length || 0} 个域名到 ${filename}`, 'success');

    return createSuccessResponse({
      success: true,
      message: '备份成功',
      filename,
      domainsCount: domains?.length || 0,
      timestamp: getCurrentBeijingTime()
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('WebDAV备份错误:', error);
    await logOperation(env, 'WebDAV备份', `备份失败: ${errorMessage}`, 'error');
    return createErrorResponse(`备份失败: ${errorMessage}`, 500);
  }
}

async function handleRestore(env: CloudflareEnv, config: WebDAVConfig, filename?: string): Promise<Response> {
  try {
    let webdavUrl = config.url;
    if (!webdavUrl.endsWith('/')) {
      webdavUrl += '/';
    }
    const backupFilename = filename || 'domains.json';
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

    await env.DOMAIN.exec('DELETE FROM domains');
    for (const domain of backupData.domains) {
      await env.DOMAIN.prepare(
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
    if (backupData.settings && Object.keys(backupData.settings).length > 0) {
      await env.DOMAIN.exec('DELETE FROM notification_settings');
      await env.DOMAIN.prepare(
        'INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES (?, ?, ?, ?)'
      ).bind(
        backupData.settings.warningDays || '15',
        backupData.settings.notificationEnabled || 'true',
        backupData.settings.notificationInterval || 'daily',
        backupData.settings.notificationMethod || '[]'
      ).run();
    }
    await logOperation(env, 'WebDAV恢复', `成功恢复 ${backupData.domains.length} 个域名，备份时间: ${toBeijingTime(backupData.timestamp)}`, 'success');

    return createSuccessResponse({
      success: true,
      message: '恢复成功',
      domainsCount: backupData.domains.length,
      timestamp: toBeijingTime(backupData.timestamp)
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('WebDAV恢复错误:', error);
    await logOperation(env, 'WebDAV恢复', `恢复失败: ${errorMessage}`, 'error');
    return createErrorResponse(`恢复失败: ${errorMessage}`, 500);
  }
}
