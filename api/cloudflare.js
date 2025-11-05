import { getDB, initializeDatabase } from './_lib/db.js';

async function logOperation(action, details, status = 'success') {
  try {
    const db = await getDB();
    await db.query(
      'INSERT INTO logs (type, action, details, status, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      ['operation', action, details, status, 'Server-Side', '127.0.0.1']
    );
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
}
async function fetchCloudflareDomains(apiKey) {
  const zones = [];
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
    const data = await response.json();
    if (!data.success) {
      throw new Error('Cloudflare API 返回错误');
    }
    zones.push(...data.result);
    if (data.result_info.count < perPage) {
      break;
    }
    page++;
  }
  const domains = zones.map((zone) => {
    const now = new Date();
    const expireDate = zone.expiration_date
      ? new Date(zone.expiration_date)
      : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    return {
      domain: zone.name,
      status: zone.status === 'active' ? 'active' : 'pending',
      registrar: 'Cloudflare',
      register_date: (zone.created_date || zone.created_on) ? (zone.created_date || zone.created_on).split('T')[0] : '',
      expire_date: expireDate.toISOString().split('T')[0],
      renewUrl: `https://dash.cloudflare.com/${zone.id}/domain`
    };
  });
  return domains;
}
export default async function handler(req, res) {
  if (req.method?.toUpperCase() !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return res.status(500).json({ success: false, error: '数据库初始化失败' });
  }
  try {
    const apiKey = process.env.CF_KEY;
    if (!apiKey) {
      await logOperation('导入Cloudflare域名', '缺少CF_KEY环境变量', 'error');
      return res.status(400).json({ success: false, error: '请在Vercel环境变量中添加CF_KEY' });
    }
    const cloudflareDomains = await fetchCloudflareDomains(apiKey);
    if (cloudflareDomains.length === 0) {
      await logOperation('导入Cloudflare域名', '未找到任何域名', 'warning');
      return res.status(404).json({ success: false, error: '未找到任何域名' });
    }
    const db = await getDB();
    const existingResult = await db.query('SELECT domain FROM domains');
    const existingDomainNames = existingResult.rows.map((d) => d.domain);
    const newDomains = cloudflareDomains.filter((d) => !existingDomainNames.includes(d.domain));
    const updatedDomains = cloudflareDomains.filter((d) => existingDomainNames.includes(d.domain));
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM domains');
      for (const domain of cloudflareDomains) {
        await client.query(
          'INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES ($1, $2, $3, $4, $5, $6)',
          [domain.domain, domain.status, domain.registrar, domain.register_date, domain.expire_date, domain.renewUrl || null]
        );
      }
      await client.query('COMMIT');
      const logDetails = `成功导入 ${cloudflareDomains.length} 个域名，新增 ${newDomains.length} 个，更新 ${updatedDomains.length} 个`;
      await logOperation('导入Cloudflare域名', logDetails, 'success');
      return res.json({
        success: true,
        message: `成功导入 ${cloudflareDomains.length} 个域名`,
        domains: cloudflareDomains,
        stats: {
          total: cloudflareDomains.length,
          new: newDomains.length,
          updated: updatedDomains.length
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage = error.message || '导入失败';
    await logOperation('导入Cloudflare域名', `导入失败: ${errorMessage}`, 'error');
    return res.status(500).json({ success: false, error: errorMessage });
  }
}
