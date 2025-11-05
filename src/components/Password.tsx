import React, { useState } from 'react';
import { isMobile } from '../utils';

interface PasswordModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: (password: string) => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  deleting?: boolean;
}

const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确认',
  cancelText = '取消',
  deleting = false
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('请输入管理员密码');
      return;
    }
    setError('');
    onConfirm(password);
    setPassword('');
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onCancel();
  };

  return (
    <div className="modal" style={{ display: 'block', zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div className="modal-content" style={isMobile() ? { width: '98%', padding: 10 } : {}}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p>{message}</p>
            <div style={{ marginTop: 15 }}>
              <label style={{ 
                display: 'block', 
                marginBottom: 8, 
                color: '#fff', 
                fontSize: 14,
                fontWeight: 600 
              }}>
                管理员密码：
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="请输入管理员密码"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: 16,
                  border: error ? '2px solid #ff4757' : '2px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)'
                }}
                autoFocus
              />
              {error && (
                <p style={{ 
                  color: '#ff4757', 
                  fontSize: 14, 
                  marginTop: 8, 
                  marginBottom: 0 
                }}>
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="modal-buttons">
            <button type="submit" className="btn btn-danger" disabled={deleting}>
              {deleting ? '删除中...' : confirmText}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={deleting}>{cancelText}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordModal; 
