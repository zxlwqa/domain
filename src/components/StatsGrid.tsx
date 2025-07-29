import React from 'react';
import { Domain } from '../types';
import { calculateProgress, getDynamicStatus } from '../utils';

interface StatsGridProps {
  domains: Domain[];
  warningDays: number;
}

const StatsGrid: React.FC<StatsGridProps> = ({ domains, warningDays }) => {
  const total = domains.length;
  const active = domains.filter((d: Domain) => getDynamicStatus(d.expire_date, warningDays) === 'active').length;
  const expired = domains.filter((d: Domain) => getDynamicStatus(d.expire_date, warningDays) === 'expired').length;
  const avgProgress = total ? Math.round(domains.reduce((sum: number, d: Domain) => sum + calculateProgress(d.register_date, d.expire_date), 0) / total) : 0;

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <h3>总域名数</h3>
        <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{total}</p>
      </div>
      <div className="stat-card">
        <h3>正常域名</h3>
        <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{active}</p>
      </div>
      <div className="stat-card">
        <h3>即将到期域名</h3>
        <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{expired}</p>
      </div>
      <div className="stat-card">
        <h3>平均使用进度</h3>
        <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{avgProgress}%</p>
      </div>
    </div>
  );
};

export default StatsGrid; 
