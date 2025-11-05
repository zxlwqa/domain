import { Domain, createErrorResponse, createSuccessResponse, CloudflareEnv } from './common';
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

async function createOrUpdateGist(
  token: string,
  gistId: string | undefined,
  content: string
): Promise<{ id: string; html_url: string }> {
  const url = gistId 
    ? `https://api.github.com/gists/${gistId}`
    : 'https://api.github.com/gists';
  
  const method = gistId ? 'PATCH' : 'POST';
  
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Domain-Manager'
    },
    body: JSON.stringify({
      description: '域名管理数据备份',
      public: false,
      files: {
        'domain.json': {
          content
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

async function findDomainGist(token: string): Promise<string | null> {
  // 获取用户的所有 Gist（处理分页，最多获取前 100 个）
  let allGists: Array<{ id: string; description: string; files: Record<string, unknown>; updated_at: string }> = [];
  let page = 1;
  const perPage = 30;
  
  while (page <= 3) { // 最多获取 3 页（90 个 Gist）
    const response = await fetch(`https://api.github.com/gists?page=${page}&per_page=${perPage}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Domain-Manager'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API错误: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const gists = await response.json() as Array<{ id: string; description: string; files: Record<string, unknown>; updated_at: string }>;
    
    if (gists.length === 0) break;
    
    allGists.push(...gists);
    
    if (gists.length < perPage) break;
    
    page++;
  }
  
  // 查找所有包含 domain.json 且描述为"域名管理数据备份"的 Gist
  const matchingGists = allGists.filter(gist => 
    gist.description === '域名管理数据备份' && 
    gist.files && 
    'domain.json' in gist.files
  );
  
  if (matchingGists.length === 0) {
    return null;
  }
  
  // 如果有多个匹配的 Gist，选择最新的（按 updated_at 排序）
  matchingGists.sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  
  return matchingGists[0].id;
}

async function getGistContent(token: string, gistId: string): Promise<string> {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Domain-Manager'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const gist = await response.json();
  const file = gist.files['domain.json'];
  
  if (!file) {
    throw new Error('Gist中未找到 domain.json 文件');
  }

  if (file.truncated && file.raw_url) {
    const rawResponse = await fetch(file.raw_url);
    if (!rawResponse.ok) {
      throw new Error('获取Gist内容失败');
    }
    return rawResponse.text();
  }

  return file.content || '';
}

export const onRequest = async (context: CloudflareContext) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const body = await request.json() as { action: string; gistId?: string };
    const { action, gistId } = body;

    const token = env.GIT_TOKEN;
    if (!token) {
      await logOperation(env, 'Gist操作', 'Git Token未配置', 'error');
      return createErrorResponse('Git Token未配置，请在环境变量中设置GIT_TOKEN', 400);
    }

    if (action === 'export') {
      const { results: domains } = await env.DOMAIN.prepare(
        'SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC'
      ).all() as { results: Array<Domain> };
      
      const { results: settings } = await env.DOMAIN.prepare(
        'SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1'
      ).all() as { results: Array<Record<string, unknown>> };

      const backupData = {
        domains: domains || [],
        settings: (settings?.[0] as Record<string, unknown>) || {},
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      const content = JSON.stringify(backupData, null, 2);
      
      // 如果没有提供 Gist ID，尝试查找现有的 Gist
      let targetGistId = gistId;
      if (!targetGistId) {
        targetGistId = await findDomainGist(token);
      }
      
      const gist = await createOrUpdateGist(token, targetGistId || undefined, content);
      
      await logOperation(env, 'Gist导出', `成功导出 ${domains?.length || 0} 个域名到 Gist: ${gist.id}`, 'success');

      return createSuccessResponse({
        success: true,
        message: '导出成功',
        gistId: gist.id,
        gistUrl: gist.html_url,
        domainsCount: domains?.length || 0,
        timestamp: new Date().toISOString()
      });

    } else if (action === 'import') {
      // 如果没有提供 Gist ID，自动查找包含 domain.json 的 Gist
      let targetGistId = gistId;
      if (!targetGistId) {
        targetGistId = await findDomainGist(token);
        if (!targetGistId) {
          return createErrorResponse('未找到包含域名备份数据的 Gist，请先执行导出操作', 404);
        }
      }

      const content = await getGistContent(token, targetGistId);
      const backupData = JSON.parse(content) as {
        domains?: Domain[];
        settings?: Record<string, unknown>;
        timestamp?: string;
      };

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
          String(backupData.settings.warningDays || '15'),
          String(backupData.settings.notificationEnabled || 'true'),
          String(backupData.settings.notificationInterval || 'daily'),
          JSON.stringify(backupData.settings.notificationMethod || [])
        ).run();
      }

      await logOperation(env, 'Gist导入', `成功导入 ${backupData.domains.length} 个域名，备份时间: ${backupData.timestamp || '未知'}`, 'success');

      return createSuccessResponse({
        success: true,
        message: '导入成功',
        domains: backupData.domains,
        domainsCount: backupData.domains.length,
        timestamp: backupData.timestamp || new Date().toISOString()
      });

    } else {
      return createErrorResponse('不支持的操作', 400);
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('Gist操作错误:', error);
    await logOperation(env, 'Gist操作', `操作失败: ${errorMessage}`, 'error');
    return createErrorResponse(`操作失败: ${errorMessage}`, 500);
  }
};

