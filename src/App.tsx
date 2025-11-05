import React, { useEffect, useState, useRef, useCallback } from 'react';

declare global {
  interface Window {
    BackgroundImageManager: {
      getAllBackgroundImages(): Promise<string[]>;
      preloadAll(): Promise<string[]>;
      preloadCustom(): void;
    };
  }
}
import {
  fetchDomains,
  saveDomains,
  deleteDomain,
  notifyExpiring,
  fetchNotificationSettingsFromServer,
  saveNotificationSettingsToServer,
  verifyAdminPassword,
  webdavBackup,
  webdavRestore,
  logAccess,
  logSystem
} from './api';
import { Domain, defaultDomain, SortOrder, NotificationMethod, NotificationSettings } from './types';
import { 
  calculateProgress, 
  getDaysLeft, 
  copyToClipboard, 
  getTodayString, 
  getDeviceInfo
} from './utils';

import StatsGrid from './components/Stats';
import DomainTable from './components/Table';
import DomainModal from './components/Domain';
import ConfirmModal from './components/Confirm';
import ExpireModal from './components/Expire';
import InfoModal from './components/Info';
import PasswordModal from './components/Password';
import SettingsModal from './components/Settings';
import LogsModal from './components/Logs';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [showRegistrar] = useState(true);
  const [showProgress] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [form, setForm] = useState<Domain>(defaultDomain);
  const [expireModal, setExpireModal] = useState(false);
  const [expiringDomains, setExpiringDomains] = useState<Domain[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<Domain | null>(null);
  const [domainToRenew, setDomainToRenew] = useState<Domain | null>(null);
  const [batchDeleteModal, setBatchDeleteModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordAction, setPasswordAction] = useState<'delete' | 'batchDelete' | 'edit' | 'renew' | null>(null);
  const [infoModal, setInfoModal] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [infoTitle, setInfoTitle] = useState('');
  const [settingsModal, setSettingsModal] = useState(false);
  const [logsModal, setLogsModal] = useState(false);

  const [warningDays, setWarningDays] = useState(() => localStorage.getItem('notificationWarningDays') || '15');
  const [notificationEnabled, setNotificationEnabled] = useState(() => localStorage.getItem('notificationEnabled') || 'true');
  const [notificationInterval, setNotificationInterval] = useState(() => localStorage.getItem('notificationInterval') || 'daily');
  const [notificationMethods, setNotificationMethods] = useState<NotificationMethod[]>(() => {
    const saved = localStorage.getItem('notificationMethods');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [dontRemindToday, setDontRemindToday] = useState(() => {
    const dontRemindDate = localStorage.getItem('dontRemindToday');
    return dontRemindDate === getTodayString();
  });
  const [notificationSentToday, setNotificationSentToday] = useState(() => {
    const lastNotificationDate = localStorage.getItem('lastNotificationDate');
    return lastNotificationDate === getTodayString();
  });
  const [isCheckingExpiring, setIsCheckingExpiring] = useState(false);

  const [bgImageUrl, setBgImageUrl] = useState(() => localStorage.getItem('customBgImageUrl') || '');
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [carouselInterval, setCarouselInterval] = useState(() => {
    const val = localStorage.getItem('carouselInterval');
    return val ? Number(val) : 30;
  });
  const [carouselEnabled, setCarouselEnabled] = useState(() => {
    const val = localStorage.getItem('carouselEnabled');
    return val ? val === 'true' : true;
  });
  const [bgImageLoaded, setBgImageLoaded] = useState(false);
  const [bgImageError, setBgImageError] = useState(false);
  const carouselIndex = useRef(0);
  const carouselTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageCache = useRef<Map<string, boolean>>(new Map());

  const [opMsg, setOpMsg] = useState('');
  useEffect(() => {
    if (opMsg) {
      const t = setTimeout(() => setOpMsg(''), 3000);
      return () => clearTimeout(t);
    }
  }, [opMsg]);

  const preloadImage = (src: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (imageCache.current.has(src)) {
        resolve(true);
        return;
      }

      const img = new Image();
      img.onload = () => {
        imageCache.current.set(src, true);
        resolve(true);
      };
      img.onerror = () => {
        imageCache.current.set(src, false);
        resolve(false);
      };
      img.src = src;
    });
  };

  const preloadAllBackgroundImages = useCallback(async () => {
    try {
      if (window.BackgroundImageManager) {
        const allImages = await window.BackgroundImageManager.getAllBackgroundImages();
        
        const imagesToPreload = [...allImages];
        if (bgImageUrl && bgImageUrl.trim() !== '') {
          imagesToPreload.push(bgImageUrl);
        }
        
        const uniqueImages = [...new Set(imagesToPreload)];
        
        const preloadPromises = uniqueImages.map(src => preloadImage(src));
        await Promise.allSettled(preloadPromises);
      } else {
        const imagesToPreload: string[] = [];
        
        if (bgImageUrl && bgImageUrl.trim() !== '') {
          imagesToPreload.push(bgImageUrl);
        }
        
        carouselImages.forEach(imageName => {
          imagesToPreload.push(`/image/${imageName}`);
        });
        
        imagesToPreload.push('/image/background.webp');
        
        const uniqueImages = [...new Set(imagesToPreload)];
        
        const preloadPromises = uniqueImages.map(src => preloadImage(src));
        await Promise.allSettled(preloadPromises);
      }
    } catch (error) {
      console.error('预加载背景图片失败:', error);
    }
  }, [bgImageUrl, carouselImages]);

  useEffect(() => {
    const lastNotificationDate = localStorage.getItem('lastNotificationDate');
    if (lastNotificationDate !== getTodayString()) {
      setNotificationSentToday(false);
    }
    
    const dontRemindDate = localStorage.getItem('dontRemindToday');
    const shouldDontRemind = dontRemindDate === getTodayString();
    setDontRemindToday(shouldDontRemind);
  }, []);

  useEffect(() => {
    if (carouselImages.length > 0) {
      preloadAllBackgroundImages().catch(error => {
        console.error('背景图片预加载失败:', error);
      });
    }
  }, [carouselImages, bgImageUrl, preloadAllBackgroundImages]);

  useEffect(() => {
    async function updateBackgroundStyles() {
      setBgImageLoaded(false);
      setBgImageError(false);
      document.body.className = 'bg-loading';

      if (bgImageUrl && bgImageUrl.trim() !== '') {
        const isLoaded = await preloadImage(bgImageUrl);
        if (isLoaded) {
          document.body.style.backgroundImage = `url('${bgImageUrl}')`;
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundRepeat = 'no-repeat';
          document.body.style.backgroundPosition = 'center center';
          const isMobile = window.innerWidth <= 768;
          document.body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
          document.body.className = 'bg-loaded';
          setBgImageLoaded(true);
        } else {
          setBgImageError(true);
          document.body.style.backgroundImage = `url('/image/background.webp')`;
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundRepeat = 'no-repeat';
          document.body.style.backgroundPosition = 'center center';
          const isMobile = window.innerWidth <= 768;
          document.body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
          document.body.className = 'bg-loaded';
        }
        
        if (carouselTimer.current) {
          clearInterval(carouselTimer.current);
          carouselTimer.current = null;
        }
        return;
      }
      
      if (carouselImages.length === 0) return;
      
      async function setBg(idx: number) {
        const url = `/image/${carouselImages[idx]}`;
        const isLoaded = await preloadImage(url);
        if (isLoaded) {
          document.body.style.backgroundImage = `url('${url}')`;
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundRepeat = 'no-repeat';
          document.body.style.backgroundPosition = 'center center';
          const isMobile = window.innerWidth <= 768;
          document.body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
          document.body.className = 'bg-loaded';
          setBgImageLoaded(true);
        } else {
          setBgImageError(true);
          document.body.style.backgroundImage = `url('/image/background.webp')`;
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundRepeat = 'no-repeat';
          document.body.style.backgroundPosition = 'center center';
          const isMobile = window.innerWidth <= 768;
          document.body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
          document.body.className = 'bg-loaded';
        }
      }
      
      if (carouselTimer.current) {
        clearInterval(carouselTimer.current);
        carouselTimer.current = null;
      }
      
      await setBg(carouselIndex.current);
      
      if (carouselEnabled && carouselImages.length > 1) {
        carouselTimer.current = setInterval(async () => {
          carouselIndex.current = (carouselIndex.current + 1) % carouselImages.length;
          await setBg(carouselIndex.current);
        }, carouselInterval * 1000);
      }
    }

    if (bgImageUrl || carouselImages.length > 0) {
      updateBackgroundStyles();
    }

    const handleResize = () => {
      if (bgImageUrl || carouselImages.length > 0) {
        updateBackgroundStyles();
      }
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      if (carouselTimer.current) {
        clearInterval(carouselTimer.current);
        carouselTimer.current = null;
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [bgImageUrl, carouselImages, carouselInterval, carouselEnabled]);

  useEffect(() => {
    return () => {
      if (carouselTimer.current) {
        clearInterval(carouselTimer.current);
        carouselTimer.current = null;
      }
    };
  }, []);

  const checkExpiringDomains = useCallback(async (domains: Domain[]) => {
    if (dontRemindToday) {
      return;
    }
    if (isCheckingExpiring) {
      return;
    }
    
    setIsCheckingExpiring(true);
    
    try {
      const localNotificationEnabled = notificationEnabled === 'true';
      if (!localNotificationEnabled) {
        const deviceInfo = getDeviceInfo();
        logSystem(
          'notification_disabled',
          '本地通知功能未启用，跳过到期域名检查',
          'warning',
          deviceInfo
        ).catch(error => {
          console.error('记录系统日志失败:', error);
        });
        return;
      }
      
      const localMethods = localStorage.getItem('notificationMethods');
      let hasNotificationMethods = false;
      if (localMethods) {
        try {
          const parsedMethods = JSON.parse(localMethods);
          hasNotificationMethods = Array.isArray(parsedMethods) && parsedMethods.length > 0;
        } catch (error) {
          console.error('解析本地通知方式失败:', error);
          hasNotificationMethods = false;
        }
      }
      
      if (!hasNotificationMethods) {
        const settingsData = await fetchNotificationSettingsFromServer();
        if (settingsData.success && settingsData.settings) {
          const settings = settingsData.settings;
          const serverNotificationEnabled = settings.notificationEnabled === 'true';
          if (!serverNotificationEnabled) {
            return;
          }
          
          const methods = settings.notificationMethods;
          if (Array.isArray(methods)) {
            hasNotificationMethods = methods.length > 0;
          } else if (typeof methods === 'string') {
            try {
              const parsedMethods = JSON.parse(methods);
              hasNotificationMethods = Array.isArray(parsedMethods) && parsedMethods.length > 0;
            } catch (error) {
              console.error('解析服务器通知方式失败:', error);
              hasNotificationMethods = false;
            }
          }
        }
      }
      
      if (!hasNotificationMethods) {
        const deviceInfo = getDeviceInfo();
        logSystem(
          'no_notification_methods',
          '未找到有效的通知方式配置，跳过到期域名检查',
          'warning',
          deviceInfo
        ).catch(error => {
          console.error('记录系统日志失败:', error);
        });
        return;
      }
      
      const localWarningDays = parseInt(warningDays || '15', 10);
      const today = new Date();
      const warningDate = new Date(today.getTime() + localWarningDays * 24 * 60 * 60 * 1000);
      
      const expiring = domains.filter(domain => {
        const expire_date = new Date(domain.expire_date);
        return expire_date <= warningDate && expire_date >= today;
      });
      
      setExpiringDomains(expiring);
      
      const deviceInfo = getDeviceInfo();
      if (expiring.length > 0) {
        if (!expireModal) {
          setExpireModal(true);
        }
        
        await logSystem(
          'expiring_domains_found',
          `找到 ${expiring.length} 个即将到期的域名，警告天数: ${localWarningDays}天`,
          'warning',
          deviceInfo
        ).catch(error => {
          console.error('记录系统日志失败:', error);
        });
        
        if (!notificationSentToday) {
          try {
            await notifyExpiring(expiring);
            localStorage.setItem('lastNotificationDate', getTodayString());
            setNotificationSentToday(true);
            
            await logSystem(
              'notification_sent',
              `成功发送到期通知，涉及 ${expiring.length} 个域名`,
              'success',
              deviceInfo
            ).catch(error => {
              console.error('记录系统日志失败:', error);
            });
          } catch (error) {
            console.error('发送通知失败:', error);
            
            await logSystem(
              'notification_failed',
              `发送到期通知失败: ${error instanceof Error ? error.message : '未知错误'}`,
              'error',
              deviceInfo
            ).catch(logError => {
              console.error('记录系统日志失败:', logError);
            });
          }
        } else {
          await logSystem(
            'notification_already_sent',
            '今日已发送过到期通知，跳过重复发送',
            'success',
            deviceInfo
          ).catch(error => {
            console.error('记录系统日志失败:', error);
          });
        }
      } else {
        logSystem(
          'no_expiring_domains',
          `检查完成，没有即将到期的域名，警告天数: ${localWarningDays}天`,
          'success',
          deviceInfo
        ).catch(error => {
          console.error('记录系统日志失败:', error);
        });
      }
    } catch (error: unknown) {
      console.error('检查到期域名时出错:', error);
      
      const deviceInfo = getDeviceInfo();
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logSystem(
        'check_error',
        `检查到期域名时发生错误: ${errorMessage}`,
        'error',
        deviceInfo
      ).catch(logError => {
        console.error('记录系统日志失败:', logError);
      });
      
    } finally {
      setIsCheckingExpiring(false);
    }
  }, [dontRemindToday, isCheckingExpiring, notificationEnabled, notificationSentToday, warningDays, expireModal]);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDomains();
      setDomains(data);
      if (!dontRemindToday && data.length > 0 && !isCheckingExpiring) {
        checkExpiringDomains(data).catch(error => {
          console.error('检查到期域名时出错:', error);
          const deviceInfo = getDeviceInfo();
          logSystem(
            'check_error',
            `检查到期域名时发生错误: ${error instanceof Error ? error.message : '未知错误'}`,
            'error',
            deviceInfo
          ).catch(logError => {
            console.error('记录系统日志失败:', logError);
          });
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '加载域名失败';
      setOpMsg(`加载失败: ${errorMessage}`);
      console.error('加载域名失败:', error);
    } finally {
      setLoading(false);
    }
  }, [dontRemindToday, isCheckingExpiring, checkExpiringDomains]);

  useEffect(() => {
    const initializeBackground = () => {
      const customBgUrl = localStorage.getItem('customBgImageUrl');
      if (customBgUrl && customBgUrl.trim() !== '') {
        document.body.style.backgroundImage = `url('${customBgUrl}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundPosition = 'center center';
        const isMobile = window.innerWidth <= 768;
        document.body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
        document.body.className = 'bg-loaded';
        setBgImageLoaded(true);
      } else {
        document.body.style.backgroundImage = `url('/image/background.webp')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundPosition = 'center center';
        const isMobile = window.innerWidth <= 768;
        document.body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
        document.body.className = 'bg-loaded';
        setBgImageLoaded(true);
      }
    };

    initializeBackground();

    loadDomains();
    loadCarouselImages();
    loadNotificationSettings();
    
    const deviceInfo = getDeviceInfo();
    logAccess(
      'access',
      '用户访问域名管理面板',
      'success',
      deviceInfo
    ).catch(error => {
      console.error('记录访问日志失败:', error);
    });
  }, []);

  async function loadNotificationSettings() {
    try {
      const data = await fetchNotificationSettingsFromServer();
      if (data.success && data.settings) {
        setWarningDays(data.settings.warningDays);
        setNotificationEnabled(data.settings.notificationEnabled);
        setNotificationInterval(data.settings.notificationInterval);
        
        const localMethods = localStorage.getItem('notificationMethods');
        if (localMethods) {
          try {
            const parsedLocalMethods = JSON.parse(localMethods);
            if (Array.isArray(parsedLocalMethods) && parsedLocalMethods.length > 0) {
              setNotificationMethods(parsedLocalMethods);
              return;
            }
          } catch {
          }
        }
        
        const settings = data.settings as NotificationSettings & { notificationMethod?: NotificationMethod[] | string; notificationMethods?: NotificationMethod[] | string; bgImageUrl?: string; carouselInterval?: number; carouselEnabled?: string };
        const methods = settings.notificationMethod ?? settings.notificationMethods;
        if (Array.isArray(methods)) {
          setNotificationMethods(methods);
          localStorage.setItem('notificationMethods', JSON.stringify(methods));
        }
        else if (typeof methods === 'string') {
          try { 
            const parsedMethods = JSON.parse(methods);
            setNotificationMethods(parsedMethods);
            localStorage.setItem('notificationMethods', methods);
          } catch { 
            setNotificationMethods([]);
            localStorage.setItem('notificationMethods', JSON.stringify([]));
          }
        } else {
          setNotificationMethods([]);
          localStorage.setItem('notificationMethods', JSON.stringify([]));
        }
        const serverBgUrl = settings.bgImageUrl ?? '';
        const serverCarouselInterval = settings.carouselInterval ?? 30;
        const serverCarouselEnabled = settings.carouselEnabled ?? 'true';

        const localBg = localStorage.getItem('customBgImageUrl');
        const localCarouselEnabled = localStorage.getItem('carouselEnabled');
        const localCarouselInterval = localStorage.getItem('carouselInterval');

        if (!localBg && serverBgUrl) {
          setBgImageUrl(serverBgUrl);
          localStorage.setItem('customBgImageUrl', serverBgUrl);
        }
        if (!localCarouselInterval && typeof serverCarouselInterval === 'number') {
          setCarouselInterval(serverCarouselInterval);
          localStorage.setItem('carouselInterval', String(serverCarouselInterval));
        }
        if (!localCarouselEnabled && typeof serverCarouselEnabled === 'string') {
          setCarouselEnabled(serverCarouselEnabled === 'true');
          localStorage.setItem('carouselEnabled', serverCarouselEnabled);
        }
      }
    } catch (error: unknown) {
      console.error('加载通知设置失败:', error);
    }
  }

  function loadCarouselImages() {
    fetch('/image/images.json')
      .then(res => res.text())
      .then(txt => {
        let data: string[] = [];
        try { data = JSON.parse(txt); } catch {
        }
        if (!Array.isArray(data) || data.length === 0) data = ["background.webp"];
        setCarouselImages(data);
      })
      .catch(() => setCarouselImages(["background.webp"]));
  }

  function handleSort(field: string) {
    setSortField(field);
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      const filteredDomains = domains.filter((domain: Domain) =>
        domain.domain.toLowerCase().includes(search.toLowerCase()) ||
        domain.registrar.toLowerCase().includes(search.toLowerCase()) ||
        domain.status.toLowerCase().includes(search.toLowerCase())
      );
      
      let sortedDomains = [...filteredDomains];
      if (sortField) {
        sortedDomains = sortedDomains.sort((a: Domain, b: Domain) => {
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
        sortedDomains = sortedDomains.sort((a: Domain, b: Domain) => new Date(a.expire_date).getTime() - new Date(b.expire_date).getTime());
      }
      
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const currentPageDomains = sortedDomains.slice(startIndex, endIndex);
      
      const currentPageIndexes = currentPageDomains.map(domain => domains.findIndex((d: Domain) => d.domain === domain.domain));
      setSelectedIndexes(currentPageIndexes);
    } else {
      setSelectedIndexes([]);
    }
  }

  function handleSelectRow(index: number, checked: boolean) {
    setSelectedIndexes((prev: number[]) => checked ? [...prev, index] : prev.filter((i: number) => i !== index));
  }

  function handleEdit(index: number) {
    setEditIndex(index);
    setForm(domains[index]);
    setPasswordAction('edit');
    setPasswordModal(true);
  }

  function handleDelete(index: number) {
    setDomainToDelete(domains[index]);
    setPasswordAction('delete');
    setPasswordModal(true);
  }

  function handleRenew(domain: Domain) {
    setDomainToRenew(domain);
    setPasswordAction('renew');
    setPasswordModal(true);
  }

  function performRenew(domain: Domain) {
    if (domain.renewUrl && domain.renewUrl.trim() !== '') {
      window.open(domain.renewUrl, '_blank');
    } else {
      showInfoModal('续期提示', `请联系注册商 ${domain.registrar} 对域名 ${domain.domain} 进行续期操作。`);
    }
  }

  function handleCopy(domain: string) {
    copyToClipboard(domain).then(() => {
      setOpMsg('域名已复制到剪贴板');
    });
  }

  function handleBatchOperation(operation: string) {
    if (operation === 'expired') handleBatchSetStatus('expired');
    else if (operation === 'active') handleBatchSetStatus('active');
    else if (operation === 'delete') handleBatchDelete();
  }

  async function handleBatchSetStatus(status: string) {
    if (selectedIndexes.length === 0) {
      showInfoModal('提示', '请先选择要操作的域名');
      return;
    }
    
    const validStatus = (status: string): 'active' | 'expired' | 'pending' => {
      if (status === 'active' || status === 'expired' || status === 'pending') return status;
      return 'pending';
    };
    
    const domainsToUpdate = selectedIndexes.map((idx: number) => domains[idx]);
    const newDomains = domains.map((d: Domain) => {
      const domainToUpdate = domainsToUpdate.find((updateDomain: Domain) => updateDomain.domain === d.domain);
      return domainToUpdate ? { ...d, status: validStatus(status) } : d;
    });
    
    await saveDomains(newDomains);
    setSelectedIndexes([]);
    await loadDomains();
    setOpMsg('批量状态修改成功');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleBatchDelete() {
    if (selectedIndexes.length === 0) {
      showInfoModal('提示', '请先选择要删除的域名');
      return;
    }
    setPasswordAction('batchDelete');
    setPasswordModal(true);
  }

  async function confirmBatchDelete() {
    try {
      setDeleting(true);
    const domainsToDelete = selectedIndexes.map((idx: number) => domains[idx]);
    const newDomains = domains.filter((domain: Domain) => !domainsToDelete.some((d: Domain) => d.domain === domain.domain));
      
      setDomains(newDomains);
    setSelectedIndexes([]);
    setOpMsg('批量删除成功');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setBatchDeleteModal(false);
      
      await saveDomains(newDomains);
    } catch (error: unknown) {
      await loadDomains();
      const errorMessage = error instanceof Error ? error.message : '批量删除失败';
      setOpMsg(`批量删除失败: ${errorMessage}`);
      console.error('批量删除失败:', error);
    } finally {
      setDeleting(false);
    }
  }

  function handleAdd() {
    setEditIndex(-1);
    setForm(defaultDomain);
    setModalOpen(true);
  }

  async function handleFormSubmit(domain: Domain) {
    try {
      setSaving(true);
    const newDomains = [...domains];
    if (editIndex >= 0) {
      newDomains[editIndex] = domain;
    } else {
      newDomains.push(domain);
    }
      
      setDomains(newDomains);
    setModalOpen(false);
    setEditIndex(-1);
    setForm(defaultDomain);
    setOpMsg('保存成功');
    window.scrollTo({ top: 0, behavior: 'smooth' });
      
      await saveDomains(newDomains);
    } catch (error: unknown) {
      await loadDomains();
      const errorMessage = error instanceof Error ? error.message : '保存失败';
      setOpMsg(`保存失败: ${errorMessage}`);
      console.error('保存域名失败:', error);
    } finally {
      setSaving(false);
    }
  }

  function handleFormChange(field: string, value: string) {
    setForm((prev: Domain) => ({ ...prev, [field]: value }));
  }

  async function handlePasswordConfirm(password: string) {
    try {
      const isValid = await verifyAdminPassword(password);
      
      if (!isValid) {
        showInfoModal('密码错误', '管理员密码不正确，请重试');
        return;
      }
      
      if (passwordAction === 'delete' && domainToDelete) {
        try {
          setDeleting(true);
          const updatedDomains = domains.filter(d => d.domain !== domainToDelete.domain);
          setDomains(updatedDomains);
        setOpMsg('域名删除成功');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setDomainToDelete(null);
          setPasswordModal(false);
          setPasswordAction(null);
          
          await deleteDomain(domainToDelete.domain);
        } catch (error: unknown) {
          await loadDomains();
          const errorMessage = error instanceof Error ? error.message : '删除失败';
          setOpMsg(`删除失败: ${errorMessage}`);
          console.error('删除域名失败:', error);
        } finally {
          setDeleting(false);
        }
      } else if (passwordAction === 'batchDelete') {
        setBatchDeleteModal(true);
        setPasswordModal(false);
        setPasswordAction(null);
      } else if (passwordAction === 'edit') {
        setModalOpen(true);
        setPasswordModal(false);
        setPasswordAction(null);
      } else if (passwordAction === 'renew' && domainToRenew) {
        performRenew(domainToRenew);
        setDomainToRenew(null);
      setPasswordModal(false);
      setPasswordAction(null);
      }
      
    } catch (error: unknown) {
      console.error('密码验证失败:', error);
      const errorMessage = error instanceof Error ? error.message : '密码验证过程中发生错误';
      showInfoModal('验证失败', `请重试: ${errorMessage}`);
    }
  }

  function handlePasswordCancel() {
    const currentAction = passwordAction;
    setPasswordModal(false);
    setPasswordAction(null);
    setDomainToDelete(null);
    setDomainToRenew(null);
    if (currentAction === 'edit') {
      setEditIndex(-1);
      setForm(defaultDomain);
    }
  }

  async function confirmDelete() {
    if (domainToDelete) {
      try {
        setDeleting(true);
        const updatedDomains = domains.filter(d => d.domain !== domainToDelete.domain);
        setDomains(updatedDomains);
      setOpMsg('域名删除成功');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    setDeleteModal(false);
    setDomainToDelete(null);
        
        await deleteDomain(domainToDelete.domain);
      } catch (error: unknown) {
        await loadDomains();
        const errorMessage = error instanceof Error ? error.message : '删除失败';
        setOpMsg(`删除失败: ${errorMessage}`);
        console.error('删除域名失败:', error);
      } finally {
        setDeleting(false);
      }
    }
  }

  function handleCloseExpireModal(dontRemind: boolean) {
    setExpireModal(false);
    if (dontRemind) {
      localStorage.setItem('dontRemindToday', getTodayString());
      setDontRemindToday(true);
    }

  }

  function showInfoModal(title: string, message: string) {
    setInfoTitle(title);
    setInfoMessage(message);
    setInfoModal(true);
  }

  async function handleImportDomains(importedDomains: Domain[]) {
    try {
      await saveDomains(importedDomains);
      setDomains(importedDomains);
      showInfoModal('✅ 导入成功', `成功导入 ${importedDomains.length} 个域名`);
    } catch (error) {
      showInfoModal('❌ 导入失败', error instanceof Error ? error.message : '导入失败');
    }
  }

  async function handleSettingsSave(settings: {
    warningDays: string;
    notificationEnabled: string;
    notificationInterval: string;
    notificationMethods: NotificationMethod[];
    bgImageUrl: string;
    carouselInterval: number;
    carouselEnabled: boolean;
  }) {
    try {
      await saveNotificationSettingsToServer({
        warningDays: settings.warningDays,
        notificationEnabled: settings.notificationEnabled,
        notificationInterval: settings.notificationInterval,
        notificationMethods: settings.notificationMethods,
        bgImageUrl: settings.bgImageUrl,
        carouselInterval: settings.carouselInterval,
        carouselEnabled: typeof settings.carouselEnabled === 'boolean' ? String(settings.carouselEnabled) : settings.carouselEnabled
      });

      setWarningDays(settings.warningDays);
      setNotificationEnabled(settings.notificationEnabled);
      setNotificationInterval(settings.notificationInterval);
      setNotificationMethods(settings.notificationMethods);
      setBgImageUrl(settings.bgImageUrl);
      setCarouselInterval(settings.carouselInterval);
      setCarouselEnabled(settings.carouselEnabled);

      localStorage.setItem('notificationWarningDays', settings.warningDays);
      localStorage.setItem('notificationEnabled', settings.notificationEnabled);
      localStorage.setItem('notificationInterval', settings.notificationInterval);
      localStorage.setItem('notificationMethods', JSON.stringify(settings.notificationMethods));
      localStorage.setItem('customBgImageUrl', settings.bgImageUrl);
      localStorage.setItem('carouselInterval', settings.carouselInterval.toString());
      localStorage.setItem('carouselEnabled', settings.carouselEnabled.toString());

      setOpMsg('设置保存成功');
    } catch (error: unknown) {
      console.error('保存设置失败:', error);
      const errorMessage = error instanceof Error ? error.message : '保存设置时发生错误';
      showInfoModal('保存失败', `请重试: ${errorMessage}`);
    }
  }

  async function handleWebDAVBackup() {
    try {
      const result = await webdavBackup({});
      showInfoModal('✅ WebDAV备份成功', `成功备份 ${result.domainsCount || 0} 个域名到 ${result.filename || 'WebDAV服务器'}，备份时间: ${result.timestamp || '未知'}`);
      setOpMsg('WebDAV备份成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '备份失败';
      showInfoModal('❌ WebDAV备份失败', errorMessage);
      throw error;
    }
  }

  async function handleWebDAVRestore() {
    try {
      const result = await webdavRestore({});
      
      await loadDomains();
      
      showInfoModal('✅ WebDAV恢复成功', `成功恢复 ${result.domainsCount || 0} 个域名，备份时间: ${result.timestamp || '未知'}`);
      setOpMsg('WebDAV恢复成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '恢复失败';
      showInfoModal('❌ WebDAV恢复失败', errorMessage);
      throw error;
    }
  }

  const GlobalOpMsg = opMsg ? (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(40,40,40,0.45)',
      color: '#fff',
      fontSize: 18,
      fontWeight: 600,
      padding: '12px 32px',
      borderRadius: 16,
      zIndex: 99999,
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      pointerEvents: 'none',
      textAlign: 'center',
      letterSpacing: 1.2,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      minWidth: 180,
      maxWidth: '80vw',
      margin: '0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>{opMsg}</div>
  ) : null;

  const BackgroundLoadingIndicator = !bgImageLoaded && !bgImageError ? (
    <div className="bg-loading-indicator" style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: 'rgba(255, 255, 255, 0.9)',
      color: '#333',
      padding: '8px 16px',
      borderRadius: 20,
      fontSize: 14,
      fontWeight: 500,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }}>
      <div style={{
        width: '16px',
        height: '16px',
        border: '2px solid #667eea',
        borderTop: '2px solid transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}></div>
      加载背景图中...
    </div>
  ) : null;

  return (
    <div className="container" style={{ maxWidth: 1300, margin: '0 auto', padding: 20, position: 'relative', zIndex: 1 }}>
      {GlobalOpMsg}
      {BackgroundLoadingIndicator}
      
      <div className="header">
        <h1>域名面板</h1>
        <p>查看域名状态、注册商、注册日期、过期日期和使用进度</p>
        <div className="logo-container" style={{ 
          marginTop: '15px', 
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              transition: 'transform 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <img 
              src="/image/logo/github.webp" 
              alt="Logo 1" 
              style={{
                height: '40px',
                width: 'auto',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
          </a>

          
          <a 
            href="https://gitlab.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              transition: 'transform 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <img 
              src="/image/logo/gitlab.webp" 
              alt="Cloudflare" 
              style={{
                height: '40px',
                width: 'auto',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
          </a>

          
          <a 
            href="https://www.youtube.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              transition: 'transform 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <img 
              src="/image/logo/youtube.webp" 
              alt="Cloudflare" 
              style={{
                height: '40px',
                width: 'auto',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
          </a>
          
          
          <a 
            href="https://www.bilibili.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              transition: 'transform 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <img 
              src="/image/logo/bilibili.webp" 
              alt="Cloudflare" 
              style={{
                height: '40px',
                width: 'auto',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
          </a>

          
          <a 
            href="https://cloudflare.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              transition: 'transform 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <img 
              src="/image/logo/cloudflare.webp" 
              alt="Cloudflare" 
              style={{
                height: '40px',
                width: 'auto',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
          </a>
          
          
          <a 
            href="https://telegram.org" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              transition: 'transform 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <img 
              src="/image/logo/telegram.webp" 
              alt="Telegram" 
              style={{
                height: '40px',
                width: 'auto',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
              }}
            />
          </a>
        </div>
        <button className="settings-btn" onClick={() => setSettingsModal(true)}>⚙️</button>
      </div>

              <StatsGrid domains={domains} warningDays={parseInt(warningDays || '15', 10)} />

      <DomainTable
        domains={domains}
        loading={loading}
        search={search}
        sortField={sortField}
        sortOrder={sortOrder}
        selectedIndexes={selectedIndexes}
        showRegistrar={showRegistrar}
        showProgress={showProgress}
        page={page}
        pageSize={pageSize}
        warningDays={parseInt(warningDays || '15', 10)}
        onSort={handleSort}
        onSelectAll={handleSelectAll}
        onSelectRow={handleSelectRow}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRenew={handleRenew}
        onCopy={handleCopy}
        onBatchOperation={handleBatchOperation}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSearchChange={setSearch}
      />

      <button className="add-domain-btn" onClick={handleAdd}>+</button>

      
      <DomainModal
        isOpen={modalOpen}
        isEdit={editIndex >= 0}
        domain={form}
        saving={saving}
        onClose={() => setModalOpen(false)}
        onSubmit={handleFormSubmit}
        onChange={handleFormChange}
      />

      <ConfirmModal
        isOpen={deleteModal}
        title="🗑️ 删除确认"
        message="确定要删除以下域名吗？此操作不可撤销："
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModal(false)}
        domains={domainToDelete ? [domainToDelete] : []}
        showDomainList={true}
      />

      <ConfirmModal
        isOpen={batchDeleteModal}
        title="🗑️ 批量删除确认"
        message={`确定要批量删除选中的 ${selectedIndexes.length} 个域名吗？此操作不可撤销：`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmBatchDelete}
        onCancel={() => setBatchDeleteModal(false)}
        domains={selectedIndexes.map(idx => domains[idx])}
        showDomainList={true}
      />

      <ExpireModal
        isOpen={expireModal}
        expiringDomains={expiringDomains}
        onClose={handleCloseExpireModal}
      />

      <InfoModal
        isOpen={infoModal}
        title={infoTitle}
        message={infoMessage}
        onClose={() => setInfoModal(false)}
      />

      <PasswordModal
        isOpen={passwordModal}
        title="🔐 管理员验证"
        message={
          passwordAction === 'delete' && domainToDelete 
            ? `确定要删除域名 "${domainToDelete.domain}" 吗？此操作需要管理员权限。`
            : passwordAction === 'edit'
            ? `确定要编辑域名 "${form.domain}" 吗？此操作需要管理员权限。`
            : passwordAction === 'renew' && domainToRenew
            ? `确定要续期域名 "${domainToRenew.domain}" 吗？此操作需要管理员权限。`
            : `确定要批量删除选中的 ${selectedIndexes.length} 个域名吗？此操作需要管理员权限。`
        }
        onConfirm={handlePasswordConfirm}
        onCancel={handlePasswordCancel}
        confirmText={
          passwordAction === 'edit' ? '验证并编辑' 
          : passwordAction === 'renew' ? '验证并续期'
          : '验证并删除'
        }
        cancelText="取消"
        deleting={deleting}
      />

      <SettingsModal
        isOpen={settingsModal}
        onClose={() => setSettingsModal(false)}
        warningDays={warningDays}
        notificationEnabled={notificationEnabled}
        notificationInterval={notificationInterval}
        notificationMethods={notificationMethods}
        bgImageUrl={bgImageUrl}
        carouselInterval={carouselInterval}
        carouselEnabled={carouselEnabled}
        domains={domains}
        onSave={handleSettingsSave}
        onImportDomains={handleImportDomains}
        onWebDAVBackup={handleWebDAVBackup}
        onWebDAVRestore={handleWebDAVRestore}
        onOpenLogs={() => setLogsModal(true)}
      />

      <LogsModal
        isOpen={logsModal}
        onClose={() => setLogsModal(false)}
      />

    </div>
  );
};

export default App; 
