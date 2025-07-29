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

export const onRequest = async (context: any) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // 确保数据库已初始化
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
      let params: any[] = [];

      if (type === 'all') {
        // 获取所有日志
        query = 'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params = [limit, offset];
      } else {
        // 按类型筛选日志
        query = 'SELECT * FROM logs WHERE type = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params = [type, limit, offset];
      }

      const { results } = await env.DB.prepare(query).bind(...params).all();
      
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
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      const { type, action, details, status, domain, notification_method, message, error_details, device_info } = body;

      // 获取用户代理和IP地址
      const userAgent = request.headers.get('user-agent') || '';
      const ipAddress = request.headers.get('cf-connecting-ip') || 
                       request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || '';

      // 统一插入到logs表
      await env.DB.prepare(
        'INSERT INTO logs (type, action, details, status, user_agent, ip_address, device_info, domain, notification_method, error_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        type,
        action,
        details,
        status,
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
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
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
        // 删除指定类型的日志
        await env.DB.prepare('DELETE FROM logs WHERE type = ?').bind(type).run();
      } else {
        // 清理所有日志
        await env.DB.prepare('DELETE FROM logs').run();
      }

      return new Response(JSON.stringify({ success: true, message: '日志清理成功' }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
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
