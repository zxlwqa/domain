import React, { useState } from 'react';
import { Domain, SortOrder, STATUS_LABELS } from '../types';
import { calculateProgress, getProgressClass, getDaysLeft, getDaysColor, copyToClipboard, isMobile, getDynamicStatus, normalizeForSearch } from '../utils';

interface DomainTableProps {
  domains: Domain[];
  loading: boolean;
  search: string;
  sortField: string | null;
  sortOrder: SortOrder;
  selectedIndexes: number[];
  showRegistrar: boolean;
  showProgress: boolean;
  page: number;
  pageSize: number;
  warningDays: number;
  onSort: (field: string) => void;
  onSelectAll: (checked: boolean) => void;
  onSelectRow: (index: number, checked: boolean) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onRenew: (domain: Domain) => void;
  onCopy: (domain: string) => void;
  onBatchOperation: (operation: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSearchChange: (search: string) => void;
}

const DomainTable: React.FC<DomainTableProps> = ({
  domains,
  loading,
  search,
  sortField,
  sortOrder,
  selectedIndexes,
  showRegistrar,
  showProgress,
  page,
  pageSize,
  warningDays,
  onSort,
  onSelectAll,
  onSelectRow,
  onEdit,
  onDelete,
  onRenew,
  onCopy,
  onBatchOperation,
  onPageChange,
  onPageSizeChange,
  onSearchChange
}) => {
  const [, setScrollTop] = useState(0);

  const filteredDomains = (): Domain[] => {
    const normSearch = normalizeForSearch(search);
    let list = domains.filter((domain: Domain) => {
      const normDomain = normalizeForSearch(domain.domain);
      const normRegistrar = normalizeForSearch(domain.registrar);
      const normStatus = normalizeForSearch(domain.status);
      return (
        normDomain.includes(normSearch) ||
        normRegistrar.includes(normSearch) ||
        normStatus.includes(normSearch)
      );
    });
    
    if (sortField) {
      list = [...list].sort((a: Domain, b: Domain) => {
        let valA: string | number | undefined = a[sortField as keyof Domain] as string | number | undefined;
        let valB: string | number | undefined = b[sortField as keyof Domain] as string | number | undefined;
        if (sortField === 'daysLeft') {
          valA = getDaysLeft(a.expire_date);
          valB = getDaysLeft(b.expire_date);
        }
        if (sortField === 'progress') {
          valA = calculateProgress(a.register_date, a.expire_date);
          valB = calculateProgress(b.register_date, b.expire_date);
        }
        if (valA !== undefined && valB !== undefined) {
          if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
          if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        }
        return 0;
      });
    } else {
      list = [...list].sort((a: Domain, b: Domain) => new Date(a.expire_date).getTime() - new Date(b.expire_date).getTime());
    }
    return list;
  };

  const pagedDomains = (list: Domain[]) => list.slice((page - 1) * pageSize, page * pageSize);
  const paged = pagedDomains(filteredDomains());
  const totalPages = Math.max(1, Math.ceil(filteredDomains().length / pageSize));

  const getSortClass = (field: string) => {
    if (sortField === field) return sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc';
    return '';
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const handleCopyDomain = async (domain: string) => {
    await copyToClipboard(domain);
    onCopy(domain);
  };

  return (
    <div className="domain-table" style={{ width: '100%', minWidth: 0, margin: '0 auto', overflowX: 'visible', maxWidth: 1300 }}>
      <div className="table-header">
        <h2>域名列表</h2>
        <div className="search-box">
          <input
            id="domain-search"
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索域名..."
            style={{
              background: 'transparent',
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
      </div>
      
      <div className="table-container" style={isMobile() ? { maxHeight: 480, position: 'relative' } : { width: '100%' }} onScroll={handleTableScroll}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span onClick={() => onSort('domain')} className={`sortable ${getSortClass('domain')}`}>域名</span>
                </div>
              </th>
              {showRegistrar && <th onClick={() => onSort('registrar')} className={`sortable ${getSortClass('registrar')}`}>注册商</th>}
              <th onClick={() => onSort('status')} className={`sortable ${getSortClass('status')}`} style={{ minWidth: 100 }}>状态</th>
              <th onClick={() => onSort('register_date')} className={`sortable ${getSortClass('register_date')}`} style={{ minWidth: 110 }}>注册日期</th>
              <th onClick={() => onSort('expire_date')} className={`sortable ${getSortClass('expire_date')}`} style={{ minWidth: 110 }}>过期日期</th>
              <th onClick={() => onSort('daysLeft')} className={`sortable ${getSortClass('daysLeft')}`} style={{ minWidth: 120 }}>到期天数</th>
              {showProgress && <th onClick={() => onSort('progress')} className={`sortable ${getSortClass('progress')}`} style={{ width: 120 }}>使用进度</th>}
              <th style={{ width: 180, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <span>操作</span>
                  <select
                    id="batch-operation"
                    style={{ height: 28, fontSize: 14, marginLeft: 2 }}
                    onChange={e => {
                      onBatchOperation(e.target.value);
                      e.target.value = '';
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>批量操作</option>
                    <option value="expired">批量为即将到期</option>
                    <option value="active">批量为正常</option>
                    <option value="delete">批量删除</option>
                  </select>
                </div>
              </th>
              <th style={{ width: 24, paddingLeft: 0, paddingRight: 0 }}>
                <input 
                  id="select-all"
                  type="checkbox" 
                  onChange={e => onSelectAll(e.target.checked)} 
                  checked={paged.length > 0 && paged.every(domain => selectedIndexes.includes(domains.findIndex(d => d.domain === domain.domain)))} 
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr style={{ height: '200px' }}>
                <td colSpan={showRegistrar && showProgress ? 11 : 9} style={{ 
                  textAlign: 'center', 
                  verticalAlign: 'middle',
                  height: '200px',
                  fontSize: '16px',
                  color: '#666'
                }}>
                  加载中...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr style={{ height: '200px' }}>
                <td colSpan={showRegistrar && showProgress ? 11 : 9} style={{ 
                  textAlign: 'center', 
                  verticalAlign: 'middle',
                  height: '200px',
                  fontSize: '16px',
                  color: '#666'
                }}>
                  暂无域名数据
                </td>
              </tr>
            ) : paged.map((domain, _index) => {
              const progress = calculateProgress(domain.register_date, domain.expire_date);
              const progressClass = getProgressClass(progress);
              const checked = selectedIndexes.includes(domains.findIndex(d => d.domain === domain.domain));
              const daysLeft = getDaysLeft(domain.expire_date);
              const daysColor = getDaysColor(daysLeft);
              const dynamicStatus = getDynamicStatus(domain.expire_date, warningDays);
              
              return (
                <tr key={domain.domain}>
                  <td className="domain-name" style={{ color: '#fff', fontWeight: 700 }}>{domain.domain}</td>
                  {showRegistrar && <td className="registrar">{domain.registrar}</td>}
                  <td><span className={`status ${dynamicStatus}`}>{STATUS_LABELS[dynamicStatus]}</span></td>
                  <td className="date">{domain.register_date}</td>
                  <td className="date">{domain.expire_date}</td>
                  <td style={{ color: daysColor, fontWeight: 600 }}>{daysLeft}天</td>
                  {showProgress && <td>
                    <div className="progress-bar">
                      <div className={`progress-fill ${progressClass}`} style={{ width: progress + '%' }}></div>
                    </div>
                    <span className="progress-text">{progress}%</span>
                  </td>}
                  <td>
                    <div className="action-buttons" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
                      <button className="btn-edit" style={{ width: 56, height: 40, padding: 0, textAlign: 'center' }} onClick={() => onEdit(domains.findIndex(d => d.domain === domain.domain))}>修改</button>
                      <button className="btn-delete" style={{ width: 56, height: 40, padding: 0, textAlign: 'center' }} onClick={() => onDelete(domains.findIndex(d => d.domain === domain.domain))}>删除</button>
                      <button className="btn-renew" style={{ width: 56, height: 40, padding: 0, textAlign: 'center' }} onClick={() => onRenew(domain)}>续期</button>
                      <button 
                        className="btn-copy" 
                        style={{ 
                          width: 40, 
                          height: 40, 
                          padding: 0, 
                          textAlign: 'center',
                          background: 'rgba(103, 194, 58, 0.1)',
                          border: '1px solid #67c23a',
                          borderRadius: 6,
                          color: '#67c23a',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }} 
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(103, 194, 58, 0.2)';
                          e.currentTarget.style.borderColor = '#85ce61';
                          e.currentTarget.style.color = '#85ce61';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(103, 194, 58, 0.1)';
                          e.currentTarget.style.borderColor = '#67c23a';
                          e.currentTarget.style.color = '#67c23a';
                        }}
                        onClick={() => handleCopyDomain(domain.domain)}
                        title="复制域名"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path fillRule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h7.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/>
                          <path fillRule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5z"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td style={{ width: 24, paddingLeft: 0, paddingRight: 0 }}>
                    <input 
                      id={`select-row-${domains.findIndex(d => d.domain === domain.domain)}`}
                      type="checkbox" 
                      checked={checked} 
                      onChange={e => onSelectRow(domains.findIndex(d => d.domain === domain.domain), e.target.checked)} 
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 900, paddingLeft: 180 }}>
          <span>每页</span>
          <select id="page-size" value={pageSize} onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}>
            {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <span>条</span>
          <button className="btn-pagination" disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))}>上一页</button>
          <span style={{ fontWeight: 700, fontSize: 18, minWidth: 120, textAlign: 'center', display: 'inline-block' }}>第 {page} / {totalPages} 页</span>
          <button className="btn-pagination" disabled={page === totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>下一页</button>
        </div>
      )}
      {totalPages === 1 && filteredDomains().length > 0 && (
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 900, paddingLeft: 180 }}>
          <span>每页</span>
          <select id="page-size-single" value={pageSize} onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}>
            {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <span>条</span>
          <span style={{ fontWeight: 700, fontSize: 18, minWidth: 120, textAlign: 'center', display: 'inline-block', color: '#fff' }}>共 {filteredDomains().length} 条数据</span>
        </div>
      )}
    </div>
  );
};

export default DomainTable; 
