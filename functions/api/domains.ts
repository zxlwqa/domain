import { Domain, createErrorResponse, createSuccessResponse, validateDomainsArray, initializeDatabase, CloudflareEnv } from './common';
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

export const onRequest = async (context: CloudflareContext) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  try {
    await initializeDatabase(env);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return createErrorResponse('数据库初始化失败', 500);
  }

  if (method === 'GET') {
    try {
      const { results } = await env.DOMAIN.prepare(
        'SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC'
      ).all();
      return createSuccessResponse({ success: true, domains: results });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      return createErrorResponse(errorMessage, 500);
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      if (!Array.isArray(body.domains)) {
        await logOperation(env, '添加域名', '数据格式错误', 'error');
        return createErrorResponse('数据格式错误', 400);
      }
      
      const validation = validateDomainsArray(body.domains);
      if (!validation.valid) {
        await logOperation(env, '添加域名', `数据校验失败: ${JSON.stringify(validation.invalidDomains)}`, 'error');
        return new Response(JSON.stringify({
          success: false,
          error: '数据校验失败',
          details: validation.invalidDomains
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        });
      }
      const { results: existingDomains } = await env.DOMAIN.prepare(
        'SELECT domain FROM domains'
      ).all();
      
      const existingDomainNames = (existingDomains as Array<{ domain: string }>).map((d) => d.domain);
      const newDomains = body.domains.filter((d: Domain) => !existingDomainNames.includes(d.domain));
      const updatedDomains = body.domains.filter((d: Domain) => existingDomainNames.includes(d.domain));
      const domainsToDelete = existingDomainNames.filter((domain: string) => !body.domains.some((d: Domain) => d.domain === domain));
      for (const d of body.domains) {
        await env.DOMAIN.prepare(`
          INSERT OR REPLACE INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) 
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl || null).run();
      }
      for (const domain of domainsToDelete) {
        await env.DOMAIN.prepare('DELETE FROM domains WHERE domain = ?').bind(domain).run();
      }
      if (newDomains.length > 0) {
        await logOperation(env, '添加域名', `成功添加 ${newDomains.length} 个新域名: ${newDomains.map((d: Domain) => d.domain).join(', ')}`, 'success');
      }
      if (updatedDomains.length > 0) {
        await logOperation(env, '更新域名', `成功更新 ${updatedDomains.length} 个域名: ${updatedDomains.map((d: Domain) => d.domain).join(', ')}`, 'success');
      }
      
      return createSuccessResponse({ success: true, message: '数据保存成功' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      await logOperation(env, '添加域名', `保存失败: ${errorMessage}`, 'error');
      return createErrorResponse(errorMessage, 500);
    }
  }

  if (method === 'DELETE') {
    try {
      const body = await request.json();
      if (!body.domain) {
        await logOperation(env, '删除域名', '缺少域名参数', 'error');
        return createErrorResponse('缺少参数', 400);
      }
      
      const { results } = await env.DOMAIN.prepare('SELECT domain FROM domains WHERE domain = ?').bind(body.domain).all();
      if (results.length === 0) {
        await logOperation(env, '删除域名', `域名不存在: ${body.domain}`, 'warning');
        return createErrorResponse('域名不存在', 404);
      }
      
      await env.DOMAIN.prepare('DELETE FROM domains WHERE domain = ?').bind(body.domain).run();
      await logOperation(env, '删除域名', `成功删除域名: ${body.domain}`, 'success');
      return createSuccessResponse({ success: true, message: '删除成功' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      await logOperation(env, '删除域名', `删除失败: ${errorMessage}`, 'error');
      return createErrorResponse(errorMessage, 500);
    }
  }

  return createErrorResponse('Method Not Allowed', 405);
}; 
