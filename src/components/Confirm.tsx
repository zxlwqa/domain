import React from 'react';
import { Domain } from '../types';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'confirm' | 'alert' | 'warning' | 'success';
  domains?: Domain[];
  showDomainList?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确定',
  cancelText = '取消',
  type = 'confirm',
  domains = [],
  showDomainList = false
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return '⚠️';
      case 'alert':
        return '❌';
      case 'success':
        return '✅';
      default:
        return '❓';
    }
  };

  const getConfirmButtonClass = () => {
    switch (type) {
      case 'warning':
        return 'btn btn-warning';
      case 'alert':
        return 'btn btn-danger';
      case 'success':
        return 'btn btn-primary';
      default:
        return 'btn btn-primary';
    }
  };

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header confirm-modal-header">
          <h3>{getIcon()} {title}</h3>
          <button className="modal-close confirm-modal-close" onClick={onCancel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        <div className="modal-body confirm-modal-body">
          <p>{message}</p>
          {showDomainList && domains.length > 0 && (
            <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
              {domains.map((domain, index) => (
                <li key={index}>{domain.domain}</li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="modal-footer confirm-modal-footer">
          {type !== 'alert' && (
            <button className="btn btn-secondary" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button className={getConfirmButtonClass()} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal; 
