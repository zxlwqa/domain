export interface Domain {
  id?: number;
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
  telegramBotToken?: string;
  telegramChatId?: string;
  wechatSendKey?: string;
  qqKey?: string;
}

export interface NotificationSettingsResponse {
  success: boolean;
  settings?: NotificationSettings;
  error?: string;
}

export interface ApiResponse {
  success: boolean;
  error?: string;
  message?: string;
}

export interface DomainsResponse extends ApiResponse {
  domains?: Domain[];
}

export interface NotificationSettingsRequest {
  warningDays: string;
  notificationEnabled: string;
  notificationInterval: string;
  notificationMethods: string[];
  telegramBotToken?: string;
  telegramChatId?: string;
  wechatSendKey?: string;
  qqKey?: string;
  bgImageUrl?: string;
  carouselInterval?: number;
  carouselEnabled?: string;
}

export interface WebDAVConfig {
  url?: string;
  username?: string;
  password?: string;
  path?: string;
}

export interface WebDAVResponse {
  success: boolean;
  message?: string;
  error?: string;
  filename?: string;
  domainsCount?: number;
  timestamp?: string;
}

export interface GistResponse {
  success: boolean;
  message?: string;
  error?: string;
  gistId?: string;
  gistUrl?: string;
  domainsCount?: number;
  timestamp?: string;
}

export type SortOrder = 'asc' | 'desc';
export type FilterStatus = 'all' | 'active' | 'expired' | 'pending';
export type ExportFormat = 'csv' | 'json' | 'txt';
export type NotificationMethod = 'telegram' | 'wechat' | 'qq';

export const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  expired: '即将到期',
  pending: '待激活',
};

export const defaultDomain: Domain = {
  domain: '',
  status: 'active',
  registrar: '',
  register_date: '',
  expire_date: '',
  renewUrl: '',
}; 
