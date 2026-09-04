/**
 * storage.js
 * localStorage 存取模块：设置、训练记录、每周统计。
 * 所有键以 "evening:" 为前缀，JSON 序列化。
 * 读取一律返回新对象，绝不返回存储内部的引用。
 */
const Storage = (() => {
const KEY_SETTINGS = 'evening:settings';
const KEY_RECORDS = 'evening:records';

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn('[storage] 读取失败，使用默认值', key, err);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[storage] 写入失败', key, err);
      return false;
    }
  }

  /** 深拷贝纯 JSON 数据（本应用数据均为纯对象）。 */
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** 规范化 dayType：显式值优先，旧记录按 resistanceTimeSec 推导。 */
  function normalizeDayType(dayType, resistanceTimeSec) {
    if (dayType === 'full' || dayType === 'stretch') return dayType;
    return (Number(resistanceTimeSec) || 0) > 0 ? 'full' : 'stretch';
  }

  /** 合并存储设置与默认设置：结构以默认为准，数值以存储为准。 */
  function mergeSettings(stored) {
    const base = clone(DEFAULT_SETTINGS);
    if (!stored || typeof stored !== 'object') return base;
    const merged = { ...base, ...stored };
    if (stored.ambient && typeof stored.ambient === 'object') {
      merged.ambient = { ...base.ambient, ...stored.ambient };
    }
    if (Array.isArray(stored.exercises)) {
      merged.exercises = base.exercises.map((defaultEx) => {
        const saved = stored.exercises.find((e) => e && e.id === defaultEx.id);
        return saved ? { ...defaultEx, ...saved } : { ...defaultEx };
      });
    }
    return merged;
  }

  return {
    loadSettings() {
      return mergeSettings(readJson(KEY_SETTINGS, null));
    },

    saveSettings(settings) {
      const normalized = mergeSettings(settings);
      return writeJson(KEY_SETTINGS, normalized);
    },

    resetSettings() {
      try {
        window.localStorage.removeItem(KEY_SETTINGS);
      } catch (err) {
        console.warn('[storage] 清除设置失败', err);
      }
      return this.loadSettings();
    },

    /** record = { date: ISO 字符串, totalTimeSec, resistanceTimeSec, completed, dayType } */
    addRecord(record) {
      const records = this.getRecords();
      records.push({
        date: record.date || new Date().toISOString(),
        totalTimeSec: Math.max(0, Number(record.totalTimeSec) || 0),
        resistanceTimeSec: Math.max(0, Number(record.resistanceTimeSec) || 0),
        completed: Boolean(record.completed),
        dayType: normalizeDayType(record.dayType, record.resistanceTimeSec)
      });
      writeJson(KEY_RECORDS, records);
      return clone(records);
    },

    getRecommendedMode() {
      const records = this.getRecords();
      const now = new Date();
      const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      windowStart.setDate(windowStart.getDate() - 1);
      const hasFull = records.some((r) => {
        const d = new Date(r.date);
        if (Number.isNaN(d.getTime()) || d < windowStart) return false;
        if (!r.completed) return false;
        return normalizeDayType(r.dayType, r.resistanceTimeSec) === 'full';
      });
      return hasFull ? 'stretch' : 'full';
    },

    isAlternateDaysEnabled() {
      try {
        const raw = window.localStorage.getItem('workout-selector:config');
        if (!raw) return true;
        const cfg = JSON.parse(raw);
        return cfg.alternateDays !== false;
      } catch (err) {
        return true;
      }
    },

    /** 按日期倒序返回记录副本。 */
    getRecords() {
      const records = readJson(KEY_RECORDS, []);
      if (!Array.isArray(records)) return [];
      return records
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    /** 本周统计：{ sessionsThisWeek, resistanceMinutesThisWeek, totalSessions } */
    getWeeklyStats() {
      const records = this.getRecords();
      const now = new Date();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);

      const weekRecords = records.filter((r) => {
        const date = new Date(r.date);
        return !Number.isNaN(date.getTime()) && date >= weekStart;
      });

      const resistanceSecThisWeek = weekRecords.reduce((sum, r) => sum + (r.resistanceTimeSec || 0), 0);
      return {
        sessionsThisWeek: weekRecords.length,
        resistanceMinutesThisWeek: Math.round((resistanceSecThisWeek / 60) * 10) / 10,
        totalSessions: records.length
      };
    },

    clearRecords() {
      try {
        window.localStorage.removeItem(KEY_RECORDS);
      } catch (err) {
        console.warn('[storage] 清除记录失败', err);
      }
    }
  };
})();
