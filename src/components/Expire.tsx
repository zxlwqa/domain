import React from 'react';
import { Domain } from '../types';
import { isMobile, getDaysLeft } from '../utils';

interface ExpireModalProps {
  isOpen: boolean;
  expiringDomains: Domain[];
  onClose: (dontRemind: boolean) => void;
}

const ExpireModal: React.FC<ExpireModalProps> = ({
  isOpen,
  expiringDomains,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal" style={{ display: 'block', zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) onClose(false); }}>
      <div className="modal-content" style={isMobile() ? { width: '98%', padding: 10 } : {}}>
        <div className="modal-header">
          <h3>⚠️ 域名到期提醒</h3>
        </div>
        <div className="modal-body">
          <p>以下域名即将到期，请及时处理：</p>
          {expiringDomains.map(domain => (
            <div key={domain.domain} style={{ 
              marginBottom: 10, 
              padding: 15, 
              background: 'rgba(255, 255, 255, 0.1)', 
              borderRadius: 12,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              color: '#fff'
            }}>
              <p style={{ margin: '5px 0' }}><strong>域名:</strong> {domain.domain}</p>
              <p style={{ margin: '5px 0' }}><strong>注册商:</strong> {domain.registrar}</p>
              <p style={{ margin: '5px 0' }}><strong>过期日期:</strong> {domain.expire_date}</p>
              <p style={{ margin: '5px 0' }}><strong>剩余天数:</strong> <span style={{ color: '#ff6b6b', fontWeight: 600 }}>{getDaysLeft(domain.expire_date)}天</span></p>
            </div>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="btn btn-primary" onClick={() => onClose(false)}>我知道了</button>
          <button className="btn btn-secondary" onClick={() => onClose(true)}>今日不再弹出</button>
        </div>
      </div>
    </div>
  );
};

export default ExpireModal; 
