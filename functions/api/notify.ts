export interface Domain {
  domain: string;
  status: string;
  registrar: string;
  register_date: string;
  expire_date: string;
  renewUrl?: string;
}

export interface NotificationSettings {
  warningDays: string;
  notificationEnabled: string;
  notificationInterval: string;
  notificationMethods: string[];
}

import { CloudflareEnv } from './common';
import type { CloudflareContext } from './types';

async function logNotificationDetail(env: CloudflareEnv, action: string, details: string, status: 'success' | 'error' | 'warning' | 'info' = 'info', domain?: string, method?: string, error?: string) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${action}: ${details}`;
    console.log(logMessage);
    await env.DOMAIN.prepare(
      'INSERT INTO logs (type, action, details, status, domain, notification_method, error_details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      'notification',
      action,
      details,
      status,
      domain || 'system',
      method || 'system',
      error || null
    ).run();
  } catch (error) {
    console.error('记录通知日志失败:', error);
  }
}

function getDaysUntilExpiry(expire_date: string): number {
  const today = new Date();
  const expiry = new Date(expire_date);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function isExpiringSoon(expire_date: string, days: number = 15): boolean {
  const daysLeft = getDaysUntilExpiry(expire_date);
  return daysLeft <= days && daysLeft > 0;
}

async function sendWeChatNotify(title: string, content: string, sendKey: string) {
  const res = await fetch(`https://sctapi.ftqq.com/${sendKey}.send`, {
    method: 'POST',
    body: new URLSearchParams({ title, desp: content })
  });
  return res.json();
}

async function sendQQNotify(content: string, key: string, qq: string) {
  const res = await fetch(`https://qmsg.zendee.cn/send/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ msg: content, qq })
  });
  return res.json();
}



export const onRequest = async (context: CloudflareContext) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    try {
      const { results } = await env.DOMAIN.prepare(
        'SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod, bg_image_url as bgImageUrl, carousel_interval as carouselInterval, carousel_enabled as carouselEnabled FROM notification_settings LIMIT 1'
      ).all();
      
      if (results.length === 0) {
        return new Response(JSON.stringify({ success: true, settings: {
          warningDays: '15',
          notificationEnabled: 'true',
          notificationInterval: 'daily',
          notificationMethod: [],
          bgImageUrl: '',
          carouselInterval: 30,
          carouselEnabled: 'true'
        } }), {
          headers: { 'content-type': 'application/json' }
        });
      }

      const row = (results[0] as { notificationMethod?: string | string[]; notificationMethods?: string | string[]; [key: string]: unknown }) || {};
      let methods: string | string[] | undefined = (row.notificationMethod ?? row.notificationMethods) as string | string[] | undefined;
      if (typeof methods === 'string') {
        try { methods = JSON.parse(methods); } catch { methods = []; }
      }
      if (!Array.isArray(methods)) methods = [];
      const payload = {
        warningDays: String(row.warningDays ?? '15'),
        notificationEnabled: String(row.notificationEnabled ?? 'true'),
        notificationInterval: String(row.notificationInterval ?? 'daily'),
        notificationMethod: methods,
        notificationMethods: methods,
        bgImageUrl: row.bgImageUrl ?? '',
        carouselInterval: row.carouselInterval ?? 30,
        carouselEnabled: String(row.carouselEnabled ?? 'true')
      };

      return new Response(JSON.stringify({ success: true, settings: payload }), {
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
      const body = await request.json() as { settings?: Record<string, unknown>; domains?: Domain[] };
      if (body.settings) {
        const incoming = body.settings;
        const s = {
          warningDays: (incoming?.warningDays ?? '15').toString(),
          notificationEnabled: (incoming?.notificationEnabled ?? 'true').toString(),
          notificationInterval: (incoming?.notificationInterval ?? 'daily').toString(),
          notificationMethod: (incoming?.notificationMethod ?? incoming?.notificationMethods ?? []) as string | string[]
        };
        if (!s.warningDays || !s.notificationEnabled || !s.notificationInterval) {
          await logNotificationDetail(env, 'SAVE_SETTINGS', '通知设置参数不完整', 'error');
          return new Response(JSON.stringify({ success: false, error: '参数不完整' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        await env.DOMAIN.exec('DELETE FROM notification_settings');
        let methodsValue: string | string[] = s.notificationMethod;
        if (typeof methodsValue === 'string') {
          try { const arr = JSON.parse(methodsValue); methodsValue = Array.isArray(arr) ? arr : []; } catch { methodsValue = []; }
        } else if (!Array.isArray(methodsValue)) {
          methodsValue = [];
        }
        await env.DOMAIN.prepare(
          'INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method, bg_image_url, carousel_interval, carousel_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          s.warningDays,
          s.notificationEnabled,
          s.notificationInterval,
          JSON.stringify(methodsValue),
          String(incoming?.bgImageUrl ?? ''),
          parseInt(String(incoming?.carouselInterval ?? '30'), 10) || 30,
          String(incoming?.carouselEnabled ?? 'true')
        ).run();
        
        await logNotificationDetail(env, 'SAVE_SETTINGS', '通知设置保存成功', 'success');
        return new Response(JSON.stringify({ success: true, message: '设置已保存' }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      if (body.domains) {
        let notifyMethods: string[] = [];
        const envMethods = [];
        if (env.TG_BOT_TOKEN && env.TG_USER_ID) {
          envMethods.push('telegram');
        }
        if (env.WECHAT_SENDKEY) {
          envMethods.push('wechat');
        }
        if (env.QMSG_KEY && env.QMSG_QQ) {
          envMethods.push('qq');
        }
        if (envMethods.length > 0) {
          notifyMethods = envMethods;
        } else {
          try {
            const { results } = await env.DOMAIN.prepare(
              'SELECT notification_method FROM notification_settings LIMIT 1'
            ).all() as { results: Array<{ notification_method?: string | string[] }> };
            if (results.length > 0) {
              const val = results[0].notification_method;
              if (Array.isArray(val)) {
                notifyMethods = val;
              } else if (typeof val === 'string') {
                try {
                  notifyMethods = JSON.parse(val);
                } catch (error) {
                  console.error('解析通知方法失败:', error);
                  notifyMethods = ['telegram'];
                }
              }
            }
          } catch (error) {
            console.error('从数据库获取通知方式失败:', error);
          }
        }
        if (!Array.isArray(notifyMethods) || notifyMethods.length === 0) {
          notifyMethods = ['telegram'];
        }
        let warningDays = 15;
        try {
          const { results } = await env.DOMAIN.prepare(
            'SELECT warning_days FROM notification_settings LIMIT 1'
          ).all() as { results: Array<{ warning_days?: string | number }> };
          if (results.length > 0 && results[0].warning_days) {
            warningDays = parseInt(String(results[0].warning_days), 10) || 15;
          }
        } catch (error) {
          console.error('获取警告天数设置失败:', error);
        }
        const expiringDomains = body.domains.filter((domain: Domain) => isExpiringSoon(domain.expire_date, warningDays));
        if (expiringDomains.length === 0) {
          return new Response(JSON.stringify({ success: true, message: '没有即将到期的域名' }), { headers: { 'content-type': 'application/json' } });
        }
        const results: Array<{ method: string; ok: boolean }> = [];
        const errors: Array<{ method: string; error: string }> = [];
        for (const method of notifyMethods) {
          try {
            if (method === 'telegram') {
              const botToken = env.TG_BOT_TOKEN;
              const chatId = env.TG_USER_ID;
              
              if (!botToken || !chatId) {
                const error = 'Telegram配置未设置';
                await logNotificationDetail(env, 'TELEGRAM_ERROR', error, 'error', undefined, 'telegram', error);
                throw new Error(error);
              }
              
              let message = '⚠️ <b>域名到期提醒</b>\n\n';
              message += `以下域名将在${warningDays}天内到期：\n\n`;
              expiringDomains.forEach((domain: Domain) => {
                const daysLeft = getDaysUntilExpiry(domain.expire_date);
                message += ` <b>${domain.domain}</b>\n`;
                message += `   注册商：${domain.registrar}\n`;
                message += `   到期时间：${domain.expire_date}\n`;
                message += `   剩余天数：${daysLeft}天\n\n`;
              });
              message += `请及时续费以避免域名过期！`;
              
              const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
              });
              
              if (!telegramResponse.ok) {
                const errorText = await telegramResponse.text();
                const error = `Telegram API请求失败: ${telegramResponse.status} ${telegramResponse.statusText} - ${errorText}`;
                await logNotificationDetail(env, 'TELEGRAM_ERROR', error, 'error', undefined, 'telegram', error);
                throw new Error(error);
              }
              
              await telegramResponse.json();
              
              results.push({ method: 'telegram', ok: true });
              
            } else if (method === 'wechat') {
              const sendKey = env.WECHAT_SENDKEY;
              if (!sendKey) {
                const error = '未配置微信SendKey';
                await logNotificationDetail(env, 'WECHAT_ERROR', error, 'error', undefined, 'wechat', error);
                throw new Error(error);
              }
              
              let content = `以下域名将在${warningDays}天内到期：\n\n`;
              expiringDomains.forEach((domain: Domain) => {
                const daysLeft = getDaysUntilExpiry(domain.expire_date);
                content += `域名: ${domain.domain}\n注册商: ${domain.registrar}\n到期时间: ${domain.expire_date}\n剩余天数: ${daysLeft}天\n\n`;
              });
              content += '请及时续费以避免域名过期！';
              
              await sendWeChatNotify('域名到期提醒', content, sendKey);
              
              results.push({ method: 'wechat', ok: true });
              
            } else if (method === 'qq') {
              const key = env.QMSG_KEY;
              const qq = env.QMSG_QQ;
              if (!key || !qq) {
                const error = '未配置Qmsg酱 key 或 QQ号';
                await logNotificationDetail(env, 'QQ_ERROR', error, 'error', undefined, 'qq', error);
                throw new Error(error);
              }
              
              let content = `以下域名将在${warningDays}天内到期：\n\n`;
              expiringDomains.forEach((domain: Domain) => {
                const daysLeft = getDaysUntilExpiry(domain.expire_date);
                content += `域名: ${domain.domain}\n注册商: ${domain.registrar}\n到期时间: ${domain.expire_date}\n剩余天数: ${daysLeft}天\n\n`;
              });
              content += '请及时续费以避免域名过期！';
              
              await sendQQNotify(content, key, qq);
              
              results.push({ method: 'qq', ok: true });
              
            } else {
              const error = '不支持的通知方式';
              await logNotificationDetail(env, 'UNSUPPORTED_METHOD', error, 'error', undefined, method, error);
              errors.push({ method, error });
            }
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            await logNotificationDetail(env, 'NOTIFY_ERROR', `发送${method}通知失败: ${errorMsg}`, 'error', undefined, method, errorMsg);
            errors.push({ method, error: errorMsg });
          }
        }
        return new Response(JSON.stringify({ success: errors.length === 0, results, errors }), { headers: { 'content-type': 'application/json' } });
      }
      
      return new Response(JSON.stringify({ success: false, error: '参数错误' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '未知错误';
      console.error('处理请求时发生错误:', errorMessage);
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
