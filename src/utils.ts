import { Domain } from './types';

export function calculateProgress(register_date: string, expire_date: string): number {
  const start = new Date(register_date).getTime();
  const end = new Date(expire_date).getTime();
  const now = Date.now();
  if (now < start) return 0;
  if (now > end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

export function getProgressClass(progress: number): string {
  if (progress >= 80) return 'danger';
  if (progress >= 60) return 'warning';
  return '';
}

export function getDaysLeft(expire_date: string): number {
  const expire_date_obj = new Date(expire_date);
  return Math.ceil((expire_date_obj.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function getDaysColor(daysLeft: number): string {
  if (daysLeft <= 7) return '#dc3545';
  if (daysLeft <= 30) return '#fd7e14';
  return '#fff';
}

export function getDynamicStatus(expire_date: string, warningDays: number = 15): string {
  const daysLeft = getDaysLeft(expire_date);
  
  if (daysLeft <= 0) {
    return 'expired';
  } else if (daysLeft <= warningDays) {
    return 'expired';
  } else {
    return 'active';
  }
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(cell => cell.replace(/^"|"$/g, '').trim());
}

export function normalizeField(s: string): string {
  return s.replace(/^"|"$/g, '').replace(/[_\s-]/g, '').toLowerCase();
}

export function validateDomain(domain: Domain): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!domain.domain || domain.domain.trim() === '') {
    errors.push('域名不能为空');
  }
  if (!domain.status || !['active', 'expired', 'pending'].includes(domain.status)) {
    errors.push('状态必须是 active、expired 或 pending');
  }
  if (!domain.registrar || domain.registrar.trim() === '') {
    errors.push('注册商不能为空');
  }
  if (!domain.register_date || isNaN(Date.parse(domain.register_date))) {
    errors.push('注册日期格式无效');
  }
  if (!domain.expire_date || isNaN(Date.parse(domain.expire_date))) {
    errors.push('到期日期格式无效');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

export function exportToCSV(domains: Domain[]): string {
  const header = ['域名', '注册商', '注册日期', '过期日期', '状态'];
  const rows = domains.map((d: Domain) => [
    d.domain,
    d.registrar,
    d.register_date,
    d.expire_date,
    d.status === 'active' ? '正常' : d.status === 'expired' ? '即将到期' : '待激活'
  ]);
  return header.join(',') + '\n' + rows.map((r: string[]) => r.join(',')).join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  });
}

export function normalizeForSearch(input: string): string {
  if (typeof input !== 'string') return '';
  const zeroWidthAndBom = /[\u200B-\u200D\uFEFF]/g;
  const variantDots = /[\u3002\uFF0E\uFF61]/g;
  return input
    .trim()
    .replace(zeroWidthAndBom, '')
    .replace(variantDots, '.')
    .replace(/\.+$/g, '')
    .toLowerCase();
}

export function getBeijingTime(date: Date = new Date()): Date {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

export function formatBeijingTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const beijingTime = getBeijingTime(dateObj);
  
  return beijingTime.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options
  });
}

export function getTodayString(): string {
  return getBeijingTime().toISOString().slice(0, 10);
}

export function isMobile(): boolean {
  return window.innerWidth <= 768;
}

export function getDeviceInfo(): string {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const language = navigator.language;
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  let deviceType = '桌面设备';
  if (isMobileDevice) {
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      deviceType = 'iOS设备';
    } else if (/Android/i.test(userAgent)) {
      deviceType = 'Android设备';
    } else {
      deviceType = '移动设备';
    }
  }
  
  return `${deviceType} | ${platform} | ${language} | ${screenWidth}x${screenHeight}`;
}

export const exportDomainsToJSON = (domains: Domain[]): void => {
  const dataStr = JSON.stringify(domains, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `domains_${getTodayString()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportDomainsToCSV = (domains: Domain[]): void => {
  const headers = ['域名', '状态', '注册商', '注册日期', '到期日期', '续费链接'];
  const csvContent = [
    headers.join(','),
    ...domains.map(domain => [
      domain.domain,
      domain.status,
      domain.registrar,
      domain.register_date,
      domain.expire_date,
      domain.renewUrl || ''
    ].join(','))
  ].join('\n');

  const dataBlob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `domains_${getTodayString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportDomainsToTXT = (domains: Domain[]): void => {
  const txtContent = domains.map(domain => 
    `域名: ${domain.domain}\n状态: ${domain.status}\n注册商: ${domain.registrar}\n注册日期: ${domain.register_date}\n到期日期: ${domain.expire_date}${domain.renewUrl ? `\n续费链接: ${domain.renewUrl}` : ''}\n`
  ).join('\n');

  const dataBlob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `domains_${getTodayString()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importDomainsFromFile = (file: File): Promise<Domain[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        let domains: Domain[] = [];

        if (file.name.endsWith('.json')) {
          domains = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').filter(line => line.trim());
          lines[0].split(',');
          
          domains = lines.slice(1).map(line => {
            const values = line.split(',');
            return {
              domain: values[0] || '',
              status: values[1] || 'active',
              registrar: values[2] || '',
              register_date: values[3] || '',
              expire_date: values[4] || '',
              renewUrl: values[5] || ''
            };
          });
        } else if (file.name.endsWith('.txt')) {
          const lines = content.split('\n').filter(line => line.trim());
          let currentDomain: Partial<Domain> = {};
          
          for (const line of lines) {
            if (line.startsWith('域名:')) {
              if (currentDomain.domain) {
                domains.push(currentDomain as Domain);
              }
              currentDomain = { domain: line.replace('域名:', '').trim() };
            } else if (line.startsWith('状态:')) {
              currentDomain.status = line.replace('状态:', '').trim();
            } else if (line.startsWith('注册商:')) {
              currentDomain.registrar = line.replace('注册商:', '').trim();
            } else if (line.startsWith('注册日期:')) {
              currentDomain.register_date = line.replace('注册日期:', '').trim();
            } else if (line.startsWith('到期日期:')) {
              currentDomain.expire_date = line.replace('到期日期:', '').trim();
            } else if (line.startsWith('续费链接:')) {
              currentDomain.renewUrl = line.replace('续费链接:', '').trim();
            }
          }
          
          if (currentDomain.domain) {
            domains.push(currentDomain as Domain);
          }
        } else {
          throw new Error('不支持的文件格式');
        }

        if (!Array.isArray(domains)) {
          throw new Error('数据格式错误');
        }

        domains = domains.filter(domain => 
          domain.domain && 
          domain.status && 
          domain.registrar && 
          domain.register_date && 
          domain.expire_date
        );

        resolve(domains);
      } catch (error) {
        reject(new Error(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsText(file, 'utf-8');
  });
};

export const validateDomainData = (domains: Domain[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!Array.isArray(domains)) {
    errors.push('数据必须是数组格式');
    return { valid: false, errors };
  }

  domains.forEach((domain, index) => {
    if (!domain.domain) {
      errors.push(`第${index + 1}行: 域名不能为空`);
    }
    if (!domain.status) {
      errors.push(`第${index + 1}行: 状态不能为空`);
    }
    if (!domain.registrar) {
      errors.push(`第${index + 1}行: 注册商不能为空`);
    }
    if (!domain.register_date) {
      errors.push(`第${index + 1}行: 注册日期不能为空`);
    }
    if (!domain.expire_date) {
      errors.push(`第${index + 1}行: 到期日期不能为空`);
    }
  });

  return { valid: errors.length === 0, errors };
}; 
