/**
 * records.js
 * 训练记录屏幕：本周统计、记录列表、清空操作。
 * 通过全局 RecordsUI 暴露给 app.js 使用，确认弹窗由外部注入。
 */
const RecordsUI = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    weekStats: $('week-stats'),
    recordsList: $('records-list'),
    btnClearRecords: $('btn-clear-records')
  };

  let confirmFn = null;

  function render() {
    renderWeeklyStats();
    renderList();
  }

  function renderWeeklyStats() {
    const stats = Storage.getWeeklyStats();
    el.weekStats.textContent = '';
    const h2 = document.createElement('h2');
    h2.textContent = '本周统计';
    const p = document.createElement('p');
    p.className = 'week-stat-line';
    p.textContent = `本周训练 ${stats.sessionsThisWeek} 次，抗阻运动 ${stats.resistanceMinutesThisWeek} 分钟`;
    const small = document.createElement('p');
    small.className = 'week-stat-sub';
    small.textContent = `累计训练 ${stats.totalSessions} 次`;
    el.weekStats.appendChild(h2);
    el.weekStats.appendChild(p);
    el.weekStats.appendChild(small);
  }

  function renderList() {
    el.recordsList.textContent = '';
    const records = Storage.getRecords();
    if (records.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'record-empty';
      empty.textContent = '暂无训练记录';
      el.recordsList.appendChild(empty);
      return;
    }
    records.forEach((record) => {
      const dayType = (record.dayType === 'stretch' || (record.dayType == null && !(record.resistanceTimeSec > 0))) ? 'stretch' : 'full';
      const li = document.createElement('li');
      li.className = 'record-item';
      const date = document.createElement('div');
      date.className = 'record-date';
      date.textContent = formatDate(record.date);
      const detail = document.createElement('div');
      detail.className = 'record-detail';
      const tag = document.createElement('span');
      tag.className = `record-tag tag-${dayType}`;
      tag.textContent = dayType === 'full' ? '抗阻' : '放松';
      detail.appendChild(tag);
      detail.appendChild(document.createTextNode(
        `${formatDuration(record.totalTimeSec)} · 抗阻 ${formatMinutes(record.resistanceTimeSec)} 分钟${record.completed ? '' : ' · 未完成'}`
      ));
      li.appendChild(date);
      li.appendChild(detail);
      el.recordsList.appendChild(li);
    });
  }

  function formatDuration(totalSec) {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}分${String(sec).padStart(2, '0')}秒`;
  }

  function formatMinutes(resistanceSec) {
    return Math.round((resistanceSec / 60) * 10) / 10;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '未知日期';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function init({ showConfirm }) {
    confirmFn = showConfirm;
    el.btnClearRecords.addEventListener('click', () => {
      if (typeof confirmFn === 'function') {
        confirmFn('确定要清空所有训练记录吗？此操作不可恢复。', () => {
          Storage.clearRecords();
          render();
        });
      }
    });
  }

  return { init, render };
})();
