import { getDB, initializeDatabase } from './_lib/db.js';

async function logOperation(action, details, status = 'success') {
  try {
    const db = await getDB();
    await db.query(
      'INSERT INTO logs (type, action, details, status, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      ['operation', action, details, status, 'Server-Side', '127.0.0.1']
    );
  } catch {
  }
}

async function createOrUpdateGist(token, gistId, content) {
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

async function findDomainGist(token) {
  // 获取用户的所有 Gist（处理分页，最多获取前 100 个）
  let allGists = [];
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

    const gists = await response.json();
    
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

async function getGistContent(token, gistId) {
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

export default async function handler(req, res) {
  const method = req.method?.toUpperCase();
  
  if (method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    await initializeDatabase();
    const db = await getDB();
    
    const { action, gistId } = req.body;

    const token = process.env.GIT_TOKEN;
    if (!token) {
      await logOperation('Gist操作', 'Git Token未配置', 'error');
      return res.status(400).json({ success: false, error: 'Git Token未配置，请在环境变量中设置GIT_TOKEN' });
    }

    if (action === 'export') {
      const doms = await db.query('SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC');
      const settings = await db.query('SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1');
      
      const backupData = {
        domains: doms.rows || [],
        settings: settings.rows[0] || {},
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
      
      await logOperation('Gist导出', `成功导出 ${doms.rows.length} 个域名到 Gist: ${gist.id}`, 'success');

      return res.json({
        success: true,
        message: '导出成功',
        gistId: gist.id,
        gistUrl: gist.html_url,
        domainsCount: doms.rows.length,
        timestamp: new Date().toISOString()
      });

    } else if (action === 'import') {
      // 如果没有提供 Gist ID，自动查找包含 domain.json 的 Gist
      let targetGistId = gistId;
      if (!targetGistId) {
        targetGistId = await findDomainGist(token);
        if (!targetGistId) {
          return res.status(404).json({ success: false, error: '未找到包含域名备份数据的 Gist，请先执行导出操作' });
        }
      }

      const content = await getGistContent(token, targetGistId);
      const backupData = JSON.parse(content);

      if (!backupData.domains || !Array.isArray(backupData.domains)) {
        throw new Error('备份文件格式错误');
      }

      await db.query('DELETE FROM domains');
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const d of backupData.domains) {
          await client.query('INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES ($1, $2, $3, $4, $5, $6)', 
            [d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl || null]);
        }
        if (backupData.settings && Object.keys(backupData.settings).length > 0) {
          await client.query('DELETE FROM notification_settings');
          await client.query('INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES ($1, $2, $3, $4)', 
            [backupData.settings.warningDays || '15', backupData.settings.notificationEnabled || 'true', backupData.settings.notificationInterval || 'daily', JSON.stringify(backupData.settings.notificationMethod || [])]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      await logOperation('Gist导入', `成功导入 ${backupData.domains.length} 个域名，备份时间: ${backupData.timestamp || '未知'}`, 'success');

      return res.json({
        success: true,
        message: '导入成功',
        domains: backupData.domains,
        domainsCount: backupData.domains.length,
        timestamp: backupData.timestamp || new Date().toISOString()
      });

    } else {
      return res.status(400).json({ success: false, error: '不支持的操作' });
    }

  } catch (error) {
    const errorMessage = error.message || '未知错误';
    console.error('Gist操作错误:', error);
    await logOperation('Gist操作', `操作失败: ${errorMessage}`, 'error');
    return res.status(500).json({ success: false, error: `操作失败: ${errorMessage}` });
  }
}

