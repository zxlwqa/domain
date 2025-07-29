import React, { useState, useEffect } from 'react';
import { getLogs, clearLogs } from '../api';
import { formatBeijingTime } from '../utils';
import ConfirmModal from './ConfirmModal';

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

  const fetchLogs = async () => {
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
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, logType, currentPage]);

  const handleClearLogs = () => {
    setConfirmModal(true);
  };

  const handleConfirmClearLogs = async () => {
    setConfirmModal(false);
    setClearLoading(true);
    try {
      const response = await clearLogs(logType);
      if (response.success) {
        // 立即清空本地日志列表，提供即时反馈
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
          {/* 控制栏 */}
          <div className="logs-controls">
            <div className="logs-filter">
              <label className="form-label">日志类型：</label>
              <select 
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

          {/* 日志列表 */}
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
                  <div key={`${log.id}-${index}`} className="log-item">
                    <div className="log-header">
                      <div className="log-action">
                        <span className="log-icon">{getActionIcon(log.action)}</span>
                        <span className="log-action-text">{log.action}</span>
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

          {/* 分页 */}
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

      {/* 确认清理日志模态框 */}
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

      {/* 提示信息模态框 */}
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
