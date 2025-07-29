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

// 详细的日志记录函数
async function logNotificationDetail(env: any, action: string, details: string, status: 'success' | 'error' | 'warning' | 'info' = 'info', domain?: string, method?: string, error?: string) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${action}: ${details}`;
    console.log(logMessage);
    
    // 记录到统一日志表
    await env.DB.prepare(
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

// 微信Server酱推送
async function sendWeChatNotify(title: string, content: string, sendKey: string) {
  const res = await fetch(`https://sctapi.ftqq.com/${sendKey}.send`, {
    method: 'POST',
    body: new URLSearchParams({ title, desp: content })
  });
  return res.json();
}

// QQ Qmsg酱推送
async function sendQQNotify(content: string, key: string, qq: string) {
  const res = await fetch(`https://qmsg.zendee.cn/send/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ msg: content, qq })
  });
  return res.json();
}



export const onRequest = async (context: any) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    // 查询通知设置
    try {
      const { results } = await env.DB.prepare(
        'SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethods FROM notification_settings LIMIT 1'
      ).all();
      
      if (results.length === 0) {
        return new Response(JSON.stringify({ success: true, settings: null }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, settings: results[0] }), {
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
      
      // 保存通知设置
      if (body.settings) {
        
        const s = body.settings as NotificationSettings;
        if (!s.warningDays || !s.notificationEnabled || !s.notificationInterval) {
          await logNotificationDetail(env, 'SAVE_SETTINGS', '通知设置参数不完整', 'error');
          return new Response(JSON.stringify({ success: false, error: '参数不完整' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        await env.DB.exec('DELETE FROM notification_settings');
        await env.DB.prepare(
          'INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES (?, ?, ?, ?)'
        ).bind(
          s.warningDays, 
          s.notificationEnabled, 
          s.notificationInterval, 
          JSON.stringify(s.notificationMethods || [])
        ).run();
        
        await logNotificationDetail(env, 'SAVE_SETTINGS', '通知设置保存成功', 'success');
        return new Response(JSON.stringify({ success: true, message: '设置已保存' }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      
      // 多方式通知分发
      if (body.domains) {
        // 从环境变量获取通知配置
        let notifyMethods: string[] = [];
        let settings: any = {};
        
        // 检查环境变量中配置的通知方式
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
        
        // 如果环境变量中有配置，优先使用环境变量
        if (envMethods.length > 0) {
          notifyMethods = envMethods;
        } else {
          // 否则从数据库获取配置
          try {
            const { results } = await env.DB.prepare(
              'SELECT notification_method FROM notification_settings LIMIT 1'
            ).all();
            if (results.length > 0) {
              const val = results[0].notification_method;
              if (Array.isArray(val)) {
                notifyMethods = val;
              } else if (typeof val === 'string') {
                try {
                  notifyMethods = JSON.parse(val);
                } catch (error) {
                  console.error('解析通知方法失败:', error);
                  notifyMethods = ['telegram']; // 默认使用telegram
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
        
        // 从数据库获取警告天数设置
        let warningDays = 15; // 默认15天
        try {
          const { results } = await env.DB.prepare(
            'SELECT warning_days FROM notification_settings LIMIT 1'
          ).all();
          if (results.length > 0 && results[0].warning_days) {
            warningDays = parseInt(results[0].warning_days, 10) || 15;
          }
        } catch (error) {
          console.error('获取警告天数设置失败:', error);
        }
        
        // 检查到期域名
        const expiringDomains = body.domains.filter((domain: Domain) => isExpiringSoon(domain.expire_date, warningDays));
        
        if (expiringDomains.length === 0) {
          return new Response(JSON.stringify({ success: true, message: '没有即将到期的域名' }), { headers: { 'content-type': 'application/json' } });
        }
        
        let results: any[] = [];
        let errors: any[] = [];
        
        // 发送通知
        for (const method of notifyMethods) {
          try {
            if (method === 'telegram') {
              // Telegram 通知逻辑
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
              
              const responseData = await telegramResponse.json();
              
              // 移除通知API中的日志记录，由前端统一记录
              
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
              
              const wechatResponse = await sendWeChatNotify('域名到期提醒', content, sendKey);
              
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
              
              const qqResponse = await sendQQNotify(content, key, qq);
              
              results.push({ method: 'qq', ok: true });
              
            } else {
              const error = '不支持的通知方式';
              await logNotificationDetail(env, 'UNSUPPORTED_METHOD', error, 'error', undefined, method, error);
              errors.push({ method, error });
            }
          } catch (err: any) {
            const errorMsg = err.message || err;
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
    } catch (e: any) {
      console.error('处理请求时发生错误:', e.message);
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
