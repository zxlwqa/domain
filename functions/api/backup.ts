import { createErrorResponse, createSuccessResponse, validateDomainsArray } from './common';
import type { CloudflareContext } from './types';

export const onRequest = async (context: CloudflareContext) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

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
        return createErrorResponse('数据格式错误', 400);
      }
      
      const validation = validateDomainsArray(body.domains);
      if (!validation.valid) {
        return new Response(JSON.stringify({
          success: false,
          error: '数据校验失败',
          details: validation.invalidDomains
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        });
      }
      await env.DOMAIN.exec('DELETE FROM domains');
      for (const d of body.domains) {
        await env.DOMAIN.prepare(
          'INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl || null).run();
      }
      return createSuccessResponse({ success: true, message: '数据保存成功' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      return createErrorResponse(errorMessage, 500);
    }
  }

  if (method === 'DELETE') {
    try {
      const body = await request.json();
      if (!body.domain) {
        return createErrorResponse('缺少参数', 400);
      }
      await env.DOMAIN.prepare('DELETE FROM domains WHERE domain = ?').bind(body.domain).run();
      return createSuccessResponse({ success: true, message: '删除成功' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      return createErrorResponse(errorMessage, 500);
    }
  }

  return createErrorResponse('Method Not Allowed', 405);
}; 
