/**
 * app.js
 * 选择器页面主控制器：运动卡片渲染、自动进入匹配、
 * 设置屏时间段配置、确认弹窗、Service Worker 注册。
 */
(() => {
  'use strict';

  const APP_VERSION = 'workout-selector-v83-260909110836';

  // ---------- DOM 引用 ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    screens: { main: $('screen-main'), settings: $('screen-settings') },
    list: $('workout-list'),
    autoCheckbox: $('chk-auto-match'),
    alternateCheckbox: $('chk-alternate-days'),
    debugCheckbox: $('chk-debug-window'),
    settingsGroups: $('settings-groups'),
    btnSettings: $('btn-settings'),
    btnBack: $('btn-back'),
    btnReset: $('btn-reset'),
    btnFaqMore: $('btn-faq-more'),
    faqMore: $('faq-more'),
    modalConfirm: $('modal-confirm'),
    modalText: $('modal-text'),
    btnConfirmYes: $('btn-confirm-yes'),
    btnConfirmNo: $('btn-confirm-no')
  };

  const RETURN_FLAG = 'selector:returned';

  // ---------- 全局状态 ----------
  const WORKOUT_REGISTRY =
    (typeof WORKOUTS !== 'undefined' && Array.isArray(WORKOUTS)) ? WORKOUTS : [];
  let config = Storage.loadConfig();

  // ---------- 时间段工具 ----------
  /** "HH:MM" 转为当日分钟数；非法输入返回 NaN。 */
  function toMinutes(str) {
    if (typeof str !== 'string') return NaN;
    const parts = str.split(':');
    if (parts.length !== 2) return NaN;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
  }

  function formatHHMM(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  /** [start, end) 半开区间判断；start > end 视为跨午夜。 */
  function isTimeInRange(nowStr, startStr, endStr) {
    const now = toMinutes(nowStr);
    const start = toMinutes(startStr);
    const end = toMinutes(endStr);
    if ([now, start, end].some(Number.isNaN)) return false;
    if (start === end) return false;
    if (start < end) return now >= start && now < end;
    return now >= start || now < end;
  }

  // ---------- 屏幕导航 ----------
  function showScreen(name) {
    el.screens.main.classList.toggle('active', name === 'main');
    el.screens.settings.classList.toggle('active', name === 'settings');
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  el.btnSettings.addEventListener('click', () => showScreen('settings'));
  el.btnBack.addEventListener('click', () => showScreen('main'));

  // Android 返回手势拦截：处于 settings 时返回仅关闭面板
  if (window.history && window.history.pushState) {
    window.history.pushState({ modal: 'settings' }, '');
    window.addEventListener('popstate', (event) => {
      if (el.screens.settings.classList.contains('active')) {
        showScreen('main');
        window.history.pushState({ modal: 'main' }, '');
      }
    });
  }

  // ---------- 确认弹窗（替代 alert/confirm） ----------
  let confirmHandler = null;
  function showConfirm(text, onYes) {
    confirmHandler = onYes;
    el.modalText.textContent = text;
    el.modalConfirm.classList.remove('hidden');
  }
  function hideConfirm() {
    el.modalConfirm.classList.add('hidden');
    confirmHandler = null;
  }
  el.btnConfirmYes.addEventListener('click', () => {
    const handler = confirmHandler;
    hideConfirm();
    if (typeof handler === 'function') handler();
  });
  el.btnConfirmNo.addEventListener('click', hideConfirm);

  // ---------- 主屏渲染 ----------
  function scheduleChipHtml(schedule) {
    const enabled = schedule && schedule.enabled === true;
    const hasTime = typeof schedule.start === 'string' && typeof schedule.end === 'string';
    if (enabled && hasTime) return `<span class="wc-chip">${schedule.start} - ${schedule.end}</span>`;
    if (enabled) return '<span class="wc-chip">自动进入已启用</span>';
    return '<span class="wc-chip wc-chip-off">自动进入已关闭</span>';
  }

  function renderMain() {
    el.autoCheckbox.checked = Boolean(config.autoMatchEnabled);
    el.alternateCheckbox.checked = config.alternateDays !== false;
    el.debugCheckbox.checked = Boolean(config.debugWindow);
    el.list.innerHTML = WORKOUT_REGISTRY.map((workout) => {
      const schedule = config.workouts[workout.id] && config.workouts[workout.id].schedule;
      const dayBadge = dayBadgeHtml(workout.id);
      return `
        <button class="workout-card" data-id="${workout.id}" type="button">
          <span class="wc-body">
            <span class="wc-head">
              <span class="wc-name">${workout.name}</span>
              ${dayBadge}
              ${scheduleChipHtml(schedule)}
            </span>
            <span class="wc-sub">${workout.subtitle}</span>
            <span class="wc-desc">${workout.description}</span>
          </span>
          <span class="wc-start">开始</span>
        </button>`;
    }).join('');
  }

  function dayBadgeHtml(workoutId) {
    if (config.alternateDays === false) return '';
    const mode = recommendModeFor(workoutId);
    if (!mode) return '';
    const label = mode === 'stretch' ? '放松日' : '抗阻日';
    const cls = mode === 'stretch' ? 'wc-chip-day wc-chip-day-stretch' : 'wc-chip-day wc-chip-day-full';
    return `<span class="${cls}">${label}</span>`;
  }

  function recommendModeFor(workoutId) {
    try {
      const raw = window.localStorage.getItem(`${workoutId}:records`);
      if (!raw) return 'full';
      const records = JSON.parse(raw);
      if (!Array.isArray(records)) return 'full';
      const now = new Date();
      const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      windowStart.setDate(windowStart.getDate() - 1);
      const hasFull = records.some((r) => {
        if (!r || r.completed !== true) return false;
        const d = new Date(r.date);
        if (Number.isNaN(d.getTime()) || d < windowStart) return false;
        const dt = r.dayType === 'full' || r.dayType === 'stretch'
          ? r.dayType
          : ((Number(r.resistanceTimeSec) || 0) > 0 ? 'full' : 'stretch');
        return dt === 'full';
      });
      return hasFull ? 'stretch' : 'full';
    } catch (err) {
      return null;
    }
  }

  // ---------- 设置屏渲染 ----------
  function renderSettings() {
    el.settingsGroups.innerHTML = WORKOUT_REGISTRY.map((workout) => {
      const schedule =
        (config.workouts[workout.id] && config.workouts[workout.id].schedule) || {};
      const enabled = schedule.enabled === true;
      return `
        <div class="card" data-id="${workout.id}">
          <h2>${workout.name}</h2>
          <label class="field-row">
            <span>参与自动进入</span>
            <input type="checkbox" data-field="enabled" ${enabled ? 'checked' : ''} aria-label="${workout.name}参与自动进入">
          </label>
          <label class="field-row">
            <span>开始时间</span>
            <input type="time" data-field="start" value="${schedule.start || ''}" aria-label="${workout.name}开始时间">
          </label>
          <label class="field-row">
            <span>结束时间</span>
            <input type="time" data-field="end" value="${schedule.end || ''}" aria-label="${workout.name}结束时间">
          </label>
        </div>`;
    }).join('');
  }

  // ---------- 配置更新（不可变：始终生成新对象） ----------
  function saveConfig() {
    Storage.saveConfig(config);
  }

  function updateSchedule(workoutId, field, input) {
    const current = (config.workouts[workoutId] && config.workouts[workoutId].schedule) || {};
    const value = field === 'enabled' ? input.checked : input.value;
    config = {
      ...config,
      workouts: {
        ...config.workouts,
        [workoutId]: {
          ...config.workouts[workoutId],
          schedule: { ...current, [field]: value }
        }
      }
    };
    saveConfig();
    renderMain();
  }

  el.settingsGroups.addEventListener('change', (event) => {
    const input = event.target;
    const group = input.closest('.card[data-id]');
    if (!group || !input.dataset.field) return;
    updateSchedule(group.dataset.id, input.dataset.field, input);
  });

  el.autoCheckbox.addEventListener('change', () => {
    config = { ...config, autoMatchEnabled: el.autoCheckbox.checked };
    saveConfig();
  });

  el.alternateCheckbox.addEventListener('change', () => {
    config = { ...config, alternateDays: el.alternateCheckbox.checked };
    saveConfig();
    renderMain();
  });

  el.debugCheckbox.addEventListener('change', () => {
    config = { ...config, debugWindow: el.debugCheckbox.checked };
    saveConfig();
    renderMain();
  });

  // ---------- FAQ 展开更多 ----------
  if (el.btnFaqMore && el.faqMore) {
    el.btnFaqMore.addEventListener('click', () => {
      const expanded = !el.faqMore.classList.contains('hidden');
      if (expanded) {
        el.faqMore.classList.add('hidden');
        el.btnFaqMore.textContent = '展开更多问题 ↓';
      } else {
        el.faqMore.classList.remove('hidden');
        el.btnFaqMore.textContent = '收起问题 ↑';
      }
    });
  }

  el.btnReset.addEventListener('click', () => {
    showConfirm('确定要恢复默认设置吗？所有时间设置将重置。', () => {
      config = Storage.resetConfig();
      renderMain();
      renderSettings();
    });
  });

  // ---------- 运动卡片点击 ----------
  el.list.addEventListener('click', (event) => {
    const card = event.target.closest('.workout-card');
    if (!card) return;
    const workout = WORKOUT_REGISTRY.find((w) => w.id === card.dataset.id);
    if (workout) window.location.href = workout.path;
  });

  // ---------- 自动进入匹配 ----------
  function userJustReturned() {
    try {
      if (sessionStorage.getItem(RETURN_FLAG) === 'true') {
        sessionStorage.removeItem(RETURN_FLAG);
        return true;
      }
    } catch (err) {
      console.warn('[selector] sessionStorage 不可用', err);
    }
    return false;
  }

  function maybeAutoEnter() {
    if (userJustReturned()) return;
    if (!config.autoMatchEnabled) return;

    const nowStr = formatHHMM(new Date());
    const matched = WORKOUT_REGISTRY.filter((workout) => {
      const schedule = config.workouts[workout.id] && config.workouts[workout.id].schedule;
      if (!schedule || schedule.enabled !== true) return false;
      return isTimeInRange(nowStr, schedule.start, schedule.end);
    });

    // 恰好命中一个时段才自动进入；多个命中或未命中时停留在选择页
    if (matched.length === 1) {
      window.location.href = matched[0].path;
    }
  }

  // ---------- Service Worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[selector] Service Worker 注册失败', err);
      });
    });
  }

  // ---------- 版本号（页面底部） ----------
  function renderFooterVersion() {
    const el = document.getElementById('footer-version');
    if (!el) return;
    el.textContent = `版本：${APP_VERSION}`;
  }

  // ---------- 备案信息（filing.js 中配置） ----------
  function renderFiling() {
    const el = document.getElementById('filing-container');
    if (!el) return;
    const html = window.FILING_HTML || '';
    if (!html) {
      el.style.display = 'none';
      return;
    }
    el.innerHTML = html;
  }

  // ---------- 初始化 ----------
  renderFooterVersion();
  renderFiling();
  renderMain();
  maybeAutoEnter();
})();
