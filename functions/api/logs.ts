export interface LogEntry {
  id?: number;
  type: 'operation' | 'notification' | 'access' | 'system';
  action: string;
  details: string;
  status: 'success' | 'error' | 'warning' | 'info';
  timestamp: string;
  user_agent?: string;
  ip_address?: string;
  device_info?: string;
  domain?: string;
  notification_method?: string;
  error_details?: string;
}

import { initializeDatabase } from './common';
import type { CloudflareContext } from './types';

export const onRequest = async (context: CloudflareContext) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  try {
    await initializeDatabase(env);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return new Response(JSON.stringify({ success: false, error: '数据库初始化失败' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const type = url.searchParams.get('type') || 'all';
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      let query = '';
      let params: unknown[] = [];

      if (type === 'all') {
        query = 'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params = [limit, offset];
      } else {
        query = 'SELECT * FROM logs WHERE type = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params = [type, limit, offset];
      }

      const { results } = await env.DOMAIN.prepare(query).bind(...params).all();
      
      return new Response(JSON.stringify({ 
        success: true, 
        logs: results,
        pagination: {
          limit,
          offset,
          total: results.length
        }
      }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      const { type, action, details, status, domain, notification_method, error_details, device_info } = body as {
        type?: string;
        action?: string;
        details?: string;
        status?: string;
        domain?: string;
        notification_method?: string;
        error_details?: string;
        device_info?: string;
      };

      const userAgent = request.headers.get('user-agent') || '';
      const ipAddress = request.headers.get('cf-connecting-ip') || 
                       request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || '';

      await env.DOMAIN.prepare(
        'INSERT INTO logs (type, action, details, status, user_agent, ip_address, device_info, domain, notification_method, error_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        type || null,
        action || null,
        details || null,
        status || null,
        userAgent,
        ipAddress,
        device_info || null,
        domain || null,
        notification_method || null,
        error_details || null
      ).run();

      return new Response(JSON.stringify({ success: true, message: '日志记录成功' }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  if (method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');

      if (type && type !== 'all') {
        await env.DOMAIN.prepare('DELETE FROM logs WHERE type = ?').bind(type).run();
      } else {
        await env.DOMAIN.prepare('DELETE FROM logs').run();
      }

      return new Response(JSON.stringify({ success: true, message: '日志清理成功' }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ success: false, error: '不支持的请求方法' }), {
    status: 405,
    headers: { 'content-type': 'application/json' }
  });
}; 
