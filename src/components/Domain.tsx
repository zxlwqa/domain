import React from 'react';
import { Domain } from '../types';
import { isMobile } from '../utils';

interface DomainModalProps {
  isOpen: boolean;
  isEdit: boolean;
  domain: Domain;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (domain: Domain) => void;
  onChange: (field: string, value: string) => void;
}

const DomainModal: React.FC<DomainModalProps> = ({
  isOpen,
  isEdit,
  domain,
  saving = false,
  onClose,
  onSubmit,
  onChange
}) => {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(domain);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    if (id === 'register_date' || id === 'expire_date') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (value && !dateRegex.test(value)) {
        const parts = value.split('-');
        if (parts.length === 3) {
          const year = parts[0].slice(0, 4);
          const month = parts[1].slice(0, 2);
          const day = parts[2].slice(0, 2);
          
          const yearNum = parseInt(year);
          if (yearNum >= 1900 && yearNum <= 9999) {
            const fixedValue = `${year}-${month}-${day}`;
            if (dateRegex.test(fixedValue)) {
              onChange(id, fixedValue);
              return;
            }
          }
        }
        return;
      }
      if (value) {
        const parts = value.split('-');
        if (parts.length === 3 && parts[0].length !== 4) {
          return;
        }
      }
    }
    
    onChange(id, value);
  };

  return (
    <div className="modal" style={{ display: 'block', zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={isMobile() ? { width: '98%', padding: 10 } : {}}>
        <div className="modal-header">
          <h3>{isEdit ? '编辑域名' : '添加新域名'}</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="domain">域名</label>
            <input 
              id="domain" 
              value={domain.domain} 
              onChange={handleChange} 
              required 
              style={{
                background: 'rgba(40,40,40,0.35)',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 18,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background 0.2s',
              }} 
            />
          </div>
          <div className="form-group">
            <label htmlFor="registrar">注册商</label>
            <input 
              id="registrar" 
              value={domain.registrar} 
              onChange={handleChange} 
              style={{
                background: 'rgba(40,40,40,0.35)',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 18,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background 0.2s',
              }} 
            />
          </div>
          <div className="form-group">
            <label htmlFor="register_date">注册日期</label>
            <input 
              type="date" 
              id="register_date" 
              value={domain.register_date} 
              onChange={handleChange} 
              required 
              min="1900-01-01"
              max="9999-12-31"
              style={{
                background: 'rgba(40,40,40,0.35)',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 18,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background 0.2s',
              }} 
            />
          </div>
          <div className="form-group">
            <label htmlFor="expire_date">过期日期</label>
            <input 
              type="date" 
              id="expire_date" 
              value={domain.expire_date} 
              onChange={handleChange} 
              required 
              min="1900-01-01"
              max="9999-12-31"
              style={{
                background: 'rgba(40,40,40,0.35)',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 18,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background 0.2s',
              }} 
            />
          </div>
          <div className="form-group">
            <label htmlFor="status">状态</label>
            <select 
              id="status" 
              value={domain.status} 
              onChange={handleChange} 
              required 
              style={{
                background: 'rgba(40,40,40,0.35)',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 18,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background 0.2s',
              }}
            >
              <option value="active">正常</option>
              <option value="expired">即将到期</option>
              <option value="pending">待激活</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="renewUrl">续期链接（可选）</label>
            <input 
              id="renewUrl" 
              value={domain.renewUrl || ''} 
              onChange={handleChange} 
              placeholder="https://..." 
              style={{
                background: 'rgba(40,40,40,0.35)',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 18,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background 0.2s',
              }} 
            />
          </div>
          <div className="modal-buttons">
            <button type="button" className="btn btn-cancel-domain" onClick={onClose} disabled={saving}>取消</button>
            <button type="submit" className="btn btn-save-domain" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DomainModal; 
