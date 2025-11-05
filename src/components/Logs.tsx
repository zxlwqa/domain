import React, { useState, useEffect, useCallback } from 'react';
import { getLogs, clearLogs } from '../api';
import { formatBeijingTime } from '../utils';
import ConfirmModal from './Confirm';

interface LogEntry {
  id?: number;
  log_type?: string;
  type?: string;
  action: string;
  details: string;
  status: 'success' | 'error' | 'warning' | 'info' | 'sent' | 'failed';
  timestamp: string;
  user_agent?: string;
  ip_address?: string;
  domain?: string;
  notification_method?: string;
  message?: string;
  error_details?: string;
  device_info?: string;
}

interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LogsModal: React.FC<LogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [logType, setLogType] = useState<'all' | 'operation' | 'notification' | 'access' | 'system'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [clearLoading, setClearLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [alertModal, setAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'error'>('success');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const limit = 20;
      const offset = (currentPage - 1) * limit;
      const response = await getLogs(logType, limit, offset);
      if (response.success) {
        setLogs(response.logs);
        setTotalPages(Math.ceil(response.pagination.total / limit));
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    } finally {
      setLoading(false);
    }
  }, [logType, currentPage]);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, logType, currentPage, fetchLogs]);

  const handleClearLogs = () => {
    setConfirmModal(true);
  };

  const handleConfirmClearLogs = async () => {
    setConfirmModal(false);
    setClearLoading(true);
    try {
      const response = await clearLogs(logType);
      if (response.success) {
        setLogs([]);
        setTotalPages(1);
        setCurrentPage(1);
        setAlertMessage('日志清理成功');
        setAlertType('success');
        setAlertModal(true);
      }
    } catch (error) {
      console.error('清理日志失败:', error);
      setAlertMessage('清理日志失败');
      setAlertType('error');
      setAlertModal(true);
    } finally {
      setClearLoading(false);
    }
  };

  const handleCancelClearLogs = () => {
    setConfirmModal(false);
  };

  const handleAlertClose = () => {
    setAlertModal(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
      case 'sent':
        return '#10b981';
      case 'error':
      case 'failed':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      case 'info':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return '成功';
      case 'error':
        return '错误';
      case 'warning':
        return '警告';
      case 'info':
        return '信息';
      case 'sent':
        return '已发送';
      case 'failed':
        return '发送失败';
      default:
        return status;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return formatBeijingTime(timestamp);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'add':
        return '➕';
      case 'edit':
        return '✏️';
      case 'delete':
        return '🗑️';
      case 'notification':
        return '📢';
      case 'backup':
        return '💾';
      case 'restore':
        return '📥';
      case 'import':
        return '📂';
      case 'export':
        return '📤';
      case 'access':
        return '🌐';
      case 'login':
        return '🔑';
      case 'daily_check':
        return '🔍';
      case 'expiring_domains_found':
        return '⚠️';
      case 'notification_sent':
        return '✅';
      case 'notification_failed':
        return '❌';
      case 'notification_disabled':
        return '🔇';
      case 'no_notification_methods':
        return '⚙️';
      case 'no_expiring_domains':
        return '✅';
      case 'notification_already_sent':
        return '📅';
      case 'check_error':
        return '💥';
      case 'check_already_done':
        return '✅';
      case 'no_domains':
        return '📭';
      case 'remind_disabled':
        return '🔇';
      default:
        return '📝';
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'no_expiring_domains':
        return '无即将到期域名';
      case 'access':
        return '访问';
      case 'notification_sent':
        return '通知发送成功';
      case 'notification_failed':
        return '通知发送失败';
      case 'notification_disabled':
        return '通知未启用';
      case 'no_notification_methods':
        return '未配置通知方式';
      case 'expiring_domains_found':
        return '发现即将到期域名';
      case 'notification_already_sent':
        return '今日已发送通知';
      case 'check_error':
        return '检查出错';
      default:
        return action;
    }
  };

  const getLogTitle = (log: LogEntry): string => {
    const parts: string[] = [];
    
    parts.push(`操作: ${getActionText(log.action)}`);
    parts.push(`状态: ${getStatusText(log.status)}`);
    parts.push(`时间: ${formatTimestamp(log.timestamp)}`);
    
    if (log.details || log.message) {
      parts.push(`详情: ${log.details || log.message}`);
    }
    
    if (log.domain) {
      parts.push(`域名: ${log.domain}`);
    }
    
    if (log.notification_method) {
      parts.push(`通知方式: ${log.notification_method}`);
    }
    
    if (log.ip_address) {
      parts.push(`IP地址: ${log.ip_address}`);
    }
    
    if (log.device_info) {
      parts.push(`设备信息: ${log.device_info}`);
    }
    
    if (log.error_details) {
      parts.push(`错误详情: ${log.error_details}`);
    }
    
    if (log.user_agent) {
      parts.push(`用户代理: ${log.user_agent}`);
    }
    
    return parts.join('\n');
  };

  if (!isOpen) return null;

  return (
    <div className="logs-modal-overlay" onClick={onClose}>
      <div className="logs-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header logs-modal-header">
          <h2>📋 系统日志</h2>
          <button className="modal-close logs-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-body logs-modal-body">
          
          <div className="logs-controls">
            <div className="logs-filter">
              <label className="form-label">日志类型：</label>
              <select 
                id="log-type-filter"
                className="form-select" 
                value={logType} 
                onChange={(e) => {
                  setLogType(e.target.value as 'all' | 'operation' | 'notification' | 'access' | 'system');
                  setCurrentPage(1);
                }}
              >
                <option value="all">全部日志</option>
                <option value="system">系统日志</option>
                <option value="operation">操作日志</option>
                <option value="notification">通知日志</option>
                <option value="access">访问日志</option>
              </select>
            </div>
            
            <button 
              className="btn btn-clear-logs"
              onClick={handleClearLogs}
              disabled={clearLoading}
            >
              {clearLoading ? '🔄 清理中...' : '🗑️ 清理日志'}
            </button>
          </div>

          
          <div className="logs-container">
            {loading ? (
              <div className="logs-loading">
                <div className="loading-spinner"></div>
                <span>加载中...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="logs-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>暂无日志记录</span>
              </div>
            ) : (
              <div className="logs-list">
                {logs.map((log, index) => (
                  <div key={`${log.id}-${index}`} className="log-item" title={getLogTitle(log)}>
                    <div className="log-header">
                      <div className="log-action">
                        <span className="log-icon">{getActionIcon(log.action)}</span>
                        <span className="log-action-text">{getActionText(log.action)}</span>
                      </div>
                      <div className="log-status">
                        <span 
                          className="status-badge"
                          style={{ backgroundColor: getStatusColor(log.status) }}
                        >
                          {getStatusText(log.status)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="log-content">
                      <div className="log-details">
                        {log.details || log.message}
                      </div>
                      
                      {log.domain && (
                        <div className="log-domain">
                          <strong>域名：</strong>{log.domain}
                        </div>
                      )}
                      
                      {log.notification_method && (
                        <div className="log-method">
                          <strong>通知方式：</strong>{log.notification_method}
                        </div>
                      )}
                      
                      {log.error_details && (
                        <div className="log-error">
                          <strong>错误详情：</strong>{log.error_details}
                        </div>
                      )}
                      
                      {log.device_info && (
                        <div className="log-device">
                          <strong>设备信息：</strong>{log.device_info}
                        </div>
                      )}
                    </div>
                    
                    <div className="log-footer">
                      <span className="log-time">{formatTimestamp(log.timestamp)}</span>
                      {log.ip_address && (
                        <span className="log-ip">IP: {log.ip_address}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          
          {totalPages > 1 && (
            <div className="logs-pagination">
              <button 
                className="btn btn-page"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </button>
              
              <span className="page-info">
                第 {currentPage} 页，共 {totalPages} 页
              </span>
              
              <button 
                className="btn btn-page"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>

      
      <ConfirmModal
        isOpen={confirmModal}
        title="清理日志确认"
        message={`确定要清理所有${logType === 'all' ? '' : logType === 'system' ? '系统' : logType === 'operation' ? '操作' : logType === 'notification' ? '通知' : '访问'}日志吗？此操作不可恢复。`}
        onConfirm={handleConfirmClearLogs}
        onCancel={handleCancelClearLogs}
        confirmText="确定清理"
        cancelText="取消"
        type="warning"
      />

      
      <ConfirmModal
        isOpen={alertModal}
        title={alertType === 'success' ? '操作成功' : '操作失败'}
        message={alertMessage}
        onConfirm={handleAlertClose}
        onCancel={handleAlertClose}
        confirmText="确定"
        type={alertType === 'success' ? 'success' : 'alert'}
      />
    </div>
  );
};

export default LogsModal; 
