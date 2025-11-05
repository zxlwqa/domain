import { useState, useEffect } from 'react';
import { Domain, NotificationMethod } from '../types';
import { notifyExpiring, fetchNotificationSettingsFromServer, saveNotificationSettingsToServer } from '../api';
import { getTodayString } from '../utils';

export function useNotification() {
  const [warningDays, setWarningDays] = useState(() => localStorage.getItem('notificationWarningDays') || '15');
  const [notificationEnabled, setNotificationEnabled] = useState(() => localStorage.getItem('notificationEnabled') || 'true');
  const [notificationInterval, setNotificationInterval] = useState(() => localStorage.getItem('notificationInterval') || 'daily');
  const [notificationMethods, setNotificationMethods] = useState<NotificationMethod[]>([]);
  const [dontRemindToday, setDontRemindToday] = useState(() => {
    const dontRemindDate = localStorage.getItem('dontRemindToday');
    return dontRemindDate === getTodayString();
  });
  const [notificationSentToday, setNotificationSentToday] = useState(() => {
    const lastNotificationDate = localStorage.getItem('lastNotificationDate');
    return lastNotificationDate === getTodayString();
  });

  const loadNotificationSettings = async () => {
    try {
      const data = await fetchNotificationSettingsFromServer();
      if (data.success && data.settings) {
        setWarningDays(data.settings.warningDays);
        setNotificationEnabled(data.settings.notificationEnabled);
        setNotificationInterval(data.settings.notificationInterval);
        const methods = (data.settings as { notificationMethod?: NotificationMethod[] | string; notificationMethods?: NotificationMethod[] | string }).notificationMethod ?? data.settings.notificationMethods;
        if (Array.isArray(methods)) {
          setNotificationMethods(methods.filter((m): m is NotificationMethod => 
            typeof m === 'string' && (m === 'telegram' || m === 'wechat' || m === 'qq')
          ));
        } else if (typeof methods === 'string') {
          try { 
            const parsed = JSON.parse(methods);
            if (Array.isArray(parsed)) {
              setNotificationMethods(parsed.filter((m): m is NotificationMethod => 
                typeof m === 'string' && (m === 'telegram' || m === 'wechat' || m === 'qq')
              ));
            } else {
              setNotificationMethods([]);
            }
          } catch { 
            setNotificationMethods([]); 
          }
        } else {
          setNotificationMethods([]);
        }
      }
    } catch (error) {
      console.error('加载通知设置失败:', error);
    }
  };

  const saveNotificationSettings = async () => {
    try {
      const res = await saveNotificationSettingsToServer({
        warningDays,
        notificationEnabled,
        notificationInterval,
        notificationMethods: notificationMethods,
        notificationMethod: JSON.stringify(notificationMethods)
      });
      return res.success;
    } catch (error) {
      console.error('保存通知设置失败:', error);
      return false;
    }
  };

  const checkExpiringDomains = async (domains: Domain[]) => {
    if (dontRemindToday) return [];
    
    try {
      const settingsData = await fetchNotificationSettingsFromServer();
      if (!settingsData.success || !settingsData.settings) return [];
      
      const settings = settingsData.settings;
      const notificationEnabled = settings.notificationEnabled === 'true';
      if (!notificationEnabled) return [];
      
      const warningDays = parseInt(settings.warningDays || '15', 10);
      const today = new Date();
      const warningDate = new Date(today.getTime() + warningDays * 24 * 60 * 60 * 1000);
      const expiring = domains.filter(domain => {
        const expire_date = new Date(domain.expire_date);
        return expire_date <= warningDate && expire_date >= today;
      });
      
      if (expiring.length > 0 && !notificationSentToday) {
        await notifyExpiring(expiring);
        localStorage.setItem('lastNotificationDate', getTodayString());
        setNotificationSentToday(true);
      }
      
      return expiring;
    } catch (error) {
      console.error('检查到期域名时出错:', error);
      return [];
    }
  };

  const handleCloseExpireModal = (dontRemind: boolean) => {
    if (dontRemind) {
      localStorage.setItem('dontRemindToday', getTodayString());
      setDontRemindToday(true);
    }
    if (!notificationSentToday) {
      localStorage.setItem('lastNotificationDate', getTodayString());
      setNotificationSentToday(true);
    }
  };

  useEffect(() => {
    const checkAndResetNotification = () => {
      const lastNotificationDate = localStorage.getItem('lastNotificationDate');
      if (lastNotificationDate !== getTodayString()) {
        setTimeout(() => {
          setNotificationSentToday(false);
        }, 0);
      }
      
      const dontRemindDate = localStorage.getItem('dontRemindToday');
      const shouldDontRemind = dontRemindDate === getTodayString();
      if (shouldDontRemind !== dontRemindToday) {
        setTimeout(() => {
          setDontRemindToday(shouldDontRemind);
        }, 0);
      }
    };
    
    checkAndResetNotification();
  }, [dontRemindToday]);

  useEffect(() => {
    setTimeout(() => {
      void loadNotificationSettings();
    }, 0);
  }, []);

  return {
    warningDays,
    setWarningDays,
    notificationEnabled,
    setNotificationEnabled,
    notificationInterval,
    setNotificationInterval,
    notificationMethods,
    setNotificationMethods,
    dontRemindToday,
    notificationSentToday,
    checkExpiringDomains,
    handleCloseExpireModal,
    saveNotificationSettings,
    loadNotificationSettings
  };
}


