import { useState, useEffect } from 'react';
import { Domain } from '../types';
import { fetchDomains, saveDomains, deleteDomain } from '../api';

export function useDomains() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDomains = async () => {
    setLoading(true);
    try {
      const data = await fetchDomains();
      setDomains(data);
    } catch (error) {
      console.error('加载域名失败:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const saveDomainsData = async (newDomains: Domain[]) => {
    try {
      await saveDomains(newDomains);
      setDomains(newDomains);
    } catch (error) {
      console.error('保存域名失败:', error);
      throw error;
    }
  };

  const deleteDomainData = async (domainName: string) => {
    try {
      await deleteDomain(domainName);
      setDomains(prev => prev.filter(d => d.domain !== domainName));
    } catch (error) {
      console.error('删除域名失败:', error);
      throw error;
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  return {
    domains,
    loading,
    loadDomains,
    saveDomains: saveDomainsData,
    deleteDomain: deleteDomainData
  };
}


