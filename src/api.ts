import { Domain, DomainsResponse, NotificationSettingsResponse, NotificationSettingsRequest, WebDAVConfig, WebDAVResponse, GistResponse } from './types';

async function fetchWithRetry(url: string, options?: RequestInit, retries = 5): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 429 || response.status >= 500) {
        const base = 200;
        const delay = base * Math.pow(2, i) + Math.floor(Math.random() * 100);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      const base = 200;
      const delay = base * Math.pow(2, i) + Math.floor(Math.random() * 100);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('请求失败，已重试多次');
}

export async function fetchDomains(): Promise<Domain[]> {
  const res = await fetchWithRetry('/api/domains');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const text = await res.text();
  let data: DomainsResponse = { success: false };
  try {
    data = text ? JSON.parse(text) : { success: false };
  } catch (error) {
    console.error('解析响应失败:', error);
    data = { success: false, error: '响应格式错误' };
  }
  if (data.success && data.domains) return data.domains;
  throw new Error(data.error || '获取域名失败');
}

export async function saveDomains(domains: Domain[]): Promise<void> {
  const res = await fetchWithRetry('/api/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const text = await res.text();
  let data: DomainsResponse = { success: false };
  try {
    data = text ? JSON.parse(text) : { success: false };
  } catch (error) {
    console.error('解析响应失败:', error);
    data = { success: false, error: '响应格式错误' };
  }
  if (!data.success) throw new Error(data.error || '保存失败');
}

export async function deleteDomain(domain: string): Promise<void> {
  const res = await fetchWithRetry('/api/domains', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const text = await res.text();
  let data: DomainsResponse = { success: false };
  try {
    data = text ? JSON.parse(text) : { success: false };
  } catch (error) {
    console.error('解析响应失败:', error);
    data = { success: false, error: '响应格式错误' };
  }
  if (!data.success) throw new Error(data.error || '删除失败');
}

export async function notifyExpiring(domains: Domain[]): Promise<void> {
  console.log('开始发送到期通知，域名数量:', domains.length);
  console.log('域名列表:', domains.map(d => `${d.domain}(${d.expire_date})`));
  
  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains })
    });
    
    console.log('通知API响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('通知API请求失败:', response.status, response.statusText, errorText);
      throw new Error(`通知发送失败: ${response.status} ${response.statusText}`);
    }
    
    const responseData = await response.json();
    console.log('通知API响应数据:', responseData);
    
    if (!responseData.success) {
      console.error('通知发送失败:', responseData.error);
      throw new Error(responseData.error || '通知发送失败');
    }
    
    console.log('通知发送成功:', responseData);
  } catch (error) {
    console.error('发送通知时发生错误:', error);
    throw error;
  }
}

export async function fetchNotificationSettingsFromServer(): Promise<NotificationSettingsResponse> {
  const res = await fetch('/api/notify');
  return res.json();
}

export async function saveNotificationSettingsToServer(settings: NotificationSettingsRequest & { notificationMethod?: string }): Promise<NotificationSettingsResponse> {
  const normalized = {
    ...settings,
    notificationMethod: settings?.notificationMethods ?? settings?.notificationMethod,
  };
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: normalized })
  });
  return res.json();
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const res = await fetch('/api/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  return data.success === true;
}

export async function webdavBackup(webdavConfig: WebDAVConfig): Promise<WebDAVResponse> {
  const res = await fetchWithRetry('/api/webdav', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'backup', webdavConfig })
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || '备份失败');
  }
  
  return data;
}

export async function webdavRestore(webdavConfig: WebDAVConfig, filename?: string): Promise<WebDAVResponse> {
  const res = await fetchWithRetry('/api/webdav', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'restore', webdavConfig, filename })
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || '恢复失败');
  }
  
  return data;
}

export async function gistExport(gistId?: string): Promise<GistResponse> {
  const res = await fetchWithRetry('/api/gist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'export',
      gistId
    })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const data: GistResponse = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Gist导出失败');
  }
  return data;
}

export async function gistImport(gistId?: string): Promise<GistResponse & { domains?: Domain[] }> {
  const res = await fetchWithRetry('/api/gist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'import',
      gistId: gistId || undefined
    })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const data: GistResponse & { domains?: Domain[] } = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Gist导入失败');
  }
  return data;
}

export interface LogEntry {
  id?: number;
  log_type?: string;
  type?: string;
  action: string;
  details: string;
  status: 'success' | 'error' | 'warning' | 'sent' | 'failed';
  timestamp: string;
  user_agent?: string;
  ip_address?: string;
  domain?: string;
  notification_method?: string;
  message?: string;
  error_details?: string;
  device_info?: string;
}

export interface LogsResponse {
  success: boolean;
  logs: LogEntry[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  error?: string;
}

export async function getLogs(type: string = 'all', limit: number = 50, offset: number = 0): Promise<LogsResponse> {
  const params = new URLSearchParams({
    type,
    limit: limit.toString(),
    offset: offset.toString()
  });
  
  const res = await fetch(`/api/logs?${params}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  
  return res.json();
}

export async function clearLogs(type: string = 'all'): Promise<{ success: boolean; message?: string; error?: string }> {
  const params = new URLSearchParams({ type });
  
  const res = await fetch(`/api/logs?${params}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  
  return res.json();
}

export async function logOperation(action: string, details: string, status: 'success' | 'error' | 'warning' = 'success'): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'operation',
        action,
        details,
        status
      })
    });
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
}

export async function logAccess(action: string, details: string, status: 'success' | 'error' | 'warning' = 'success', device_info?: string): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'access',
        action,
        details,
        status,
        device_info
      })
    });
  } catch (error) {
    console.error('记录访问日志失败:', error);
  }
}

export async function logNotification(domain: string, notification_method: string, status: 'sent' | 'failed', message: string, error_details?: string): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'notification',
        domain,
        notification_method,
        status,
        message,
        error_details
      })
    });
  } catch (error) {
    console.error('记录通知日志失败:', error);
  }
}

export async function logSystem(action: string, details: string, status: 'success' | 'error' | 'warning' | 'info' = 'success', device_info?: string): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'system',
        action,
        details,
        status,
        device_info
      })
    });
  } catch (error) {
    console.error('记录系统日志失败:', error);
  }
}

export interface CloudflareImportResponse {
  success: boolean;
  message?: string;
  domains?: Domain[];
  stats?: {
    total: number;
    new: number;
    updated: number;
  };
  error?: string;
}

export async function importCloudflareDomains(): Promise<CloudflareImportResponse> {
  const res = await fetchWithRetry('/api/cloudflare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || '导入失败');
  }
  
  return data;
} 
