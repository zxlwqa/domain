import { Domain, createErrorResponse, createSuccessResponse, initializeDatabase } from './common';

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  created_on: string;
  modified_on: string;
  name_servers: string[];
  original_name_servers: string[];
  original_registrar: string;
  original_dnshost: string;
  created_date: string;
  activated_date: string;
  expiration_date: string;
}

interface CloudflareZonesResponse {
  success: boolean;
  result: CloudflareZone[];
  result_info: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
  };
}

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

// 从 Cloudflare API 获取域名列表
async function fetchCloudflareDomains(apiKey: string): Promise<Domain[]> {
  const zones: CloudflareZone[] = [];
  let page = 1;
  const perPage = 50;
  
  while (true) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones?page=${page}&per_page=${perPage}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data: CloudflareZonesResponse = await response.json();
    
    if (!data.success) {
      throw new Error('Cloudflare API 返回错误');
    }
    
    zones.push(...data.result);
    
    // 检查是否还有更多页面
    if (data.result_info.count < perPage) {
      break;
    }
    page++;
  }
  
  // 转换为 Domain 格式
  const domains: Domain[] = zones.map(zone => {
    const now = new Date();
    const expireDate = zone.expiration_date ? new Date(zone.expiration_date) : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 默认一年后到期
    
    return {
      domain: zone.name,
      status: zone.status === 'active' ? 'active' : 'pending',
      registrar: 'Cloudflare',
      register_date: zone.created_date || zone.created_on,
      expire_date: expireDate.toISOString().split('T')[0],
      renewUrl: `https://dash.cloudflare.com/${zone.id}/domain`
    };
  });
  
  return domains;
}

export const onRequest = async (context: any) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // 确保数据库已初始化
  try {
    await initializeDatabase(env);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return createErrorResponse('数据库初始化失败', 500);
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      
      // 从环境变量获取API密钥
      const apiKey = env.CF_KEY;
      if (!apiKey) {
        await logOperation(env, '导入Cloudflare域名', '缺少CF_KEY环境变量', 'error');
        return createErrorResponse('请在Cloudflare Pages中添加CF_KEY环境变量', 400);
      }
      
      // 从 Cloudflare API 获取域名列表
      const cloudflareDomains = await fetchCloudflareDomains(apiKey);
      
      if (cloudflareDomains.length === 0) {
        await logOperation(env, '导入Cloudflare域名', '未找到任何域名', 'warning');
        return createErrorResponse('未找到任何域名', 404);
      }
      
      // 获取当前域名列表
      const { results: existingDomains } = await env.DB.prepare(
        'SELECT domain FROM domains'
      ).all();
      
      const existingDomainNames = existingDomains.map((d: any) => d.domain);
      const newDomains = cloudflareDomains.filter(d => !existingDomainNames.includes(d.domain));
      const updatedDomains = cloudflareDomains.filter(d => existingDomainNames.includes(d.domain));
      
      // 保存到数据库
      await env.DB.exec('DELETE FROM domains');
      for (const domain of cloudflareDomains) {
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
      
      // 记录操作日志
      const logDetails = `成功导入 ${cloudflareDomains.length} 个域名，新增 ${newDomains.length} 个，更新 ${updatedDomains.length} 个`;
      await logOperation(env, '导入Cloudflare域名', logDetails, 'success');
      
      return createSuccessResponse({
        success: true,
        message: `成功导入 ${cloudflareDomains.length} 个域名`,
        domains: cloudflareDomains,
        stats: {
          total: cloudflareDomains.length,
          new: newDomains.length,
          updated: updatedDomains.length
        }
      });
      
    } catch (error: any) {
      const errorMessage = error.message || '导入失败';
      await logOperation(env, '导入Cloudflare域名', `导入失败: ${errorMessage}`, 'error');
      return createErrorResponse(errorMessage, 500);
    }
  }

  return createErrorResponse('Method Not Allowed', 405);
}; 
