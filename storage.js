/**
 * storage.js
 * localStorage 封装 — 选择器配置。
 * 键以 "workout-selector:" 为前缀，JSON 序列化。
 * 读取一律返回新对象，绝不返回存储内部的引用。
 * 全局暴露：Storage（loadConfig / saveConfig / resetConfig）。
 */
const Storage = (() => {
  const KEY_CONFIG = 'workout-selector:config';

  // 默认配置：由 workouts.js 注册表推导，保证注册表是唯一数据源
  const WORKOUT_REGISTRY =
    (typeof WORKOUTS !== 'undefined' && Array.isArray(WORKOUTS)) ? WORKOUTS : [];

  const DEFAULT_CONFIG = {
    autoMatchEnabled: false,
    alternateDays: true,
    workouts: Object.fromEntries(
      WORKOUT_REGISTRY.map((w) => [w.id, { schedule: { ...(w.schedule || {}) } }])
    )
  };

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn('[selector-storage] 读取失败，使用默认值', key, err);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[selector-storage] 写入失败', key, err);
      return false;
    }
  }

  /** 深拷贝纯 JSON 数据（本应用数据均为纯对象）。 */
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * 合并存储配置与默认配置：结构以默认为准，数值以存储为准。
   * 存储中多出的运动（注册表已删除的旧条目）也保留，避免配置丢失。
   */
  function mergeConfig(stored) {
    const base = clone(DEFAULT_CONFIG);
    if (!stored || typeof stored !== 'object') return base;

    const merged = { ...base, ...stored };
    merged.autoMatchEnabled = Boolean(merged.autoMatchEnabled);
    merged.alternateDays = merged.alternateDays !== false;

    const storedWorkouts =
      (stored.workouts && typeof stored.workouts === 'object') ? stored.workouts : {};
    const ids = Object.keys({ ...base.workouts, ...storedWorkouts });

    merged.workouts = {};
    ids.forEach((id) => {
      const def = base.workouts[id] || { schedule: {} };
      const saved = storedWorkouts[id] || {};
      const defSchedule = def.schedule || {};
      const savedSchedule =
        (saved.schedule && typeof saved.schedule === 'object') ? saved.schedule : {};
      merged.workouts[id] = {
        schedule: { ...defSchedule, ...savedSchedule }
      };
    });
    return merged;
  }

  return {
    /** 读取配置并合并默认值，始终返回全新对象。 */
    loadConfig() {
      return mergeConfig(readJson(KEY_CONFIG, null));
    },

    /** 保存配置；返回值表示是否写入成功。 */
    saveConfig(config) {
      return writeJson(KEY_CONFIG, mergeConfig(config));
    },

    /** 清除存储并返回默认配置。 */
    resetConfig() {
      try {
        window.localStorage.removeItem(KEY_CONFIG);
      } catch (err) {
        console.warn('[selector-storage] 清除配置失败', err);
      }
      return mergeConfig(null);
    }
  };
})();
