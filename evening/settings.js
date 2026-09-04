/**
 * settings.js
 * 设置屏幕 UI：语音参数 + 动作参数渲染、编辑与持久化。
 * 通过全局 SettingsUI 暴露给 app.js 使用。
 */
const SettingsUI = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    settingRate: $('setting-rate'),
    settingVolume: $('setting-volume'),
    settingBeep: $('setting-beep'),
    settingAmbientEnabled: $('setting-ambient-enabled'),
    settingAmbientDucking: $('setting-ambient-ducking'),
    settingAmbientType: $('setting-ambient-type'),
    settingAmbientVolume: $('setting-ambient-volume'),
    rateValue: $('rate-value'),
    volumeValue: $('volume-value'),
    ambientVolumeValue: $('ambient-volume-value'),
    exerciseConfigs: $('exercise-configs'),
    btnReset: $('btn-reset')
  };

  const EXERCISE_FIELDS = {
    warmup: [['cycles', '循环次数'], ['cycleSec', '每次秒数']],
    resistance: [['sets', '组数'], ['repsPerSide', '每侧次数'], ['repSec', '每次秒数'], ['restSec', '组间休息秒']],
    resistanceSingle: [['sets', '组数'], ['reps', '每组次数'], ['repSec', '每次秒数'], ['restSec', '组间休息秒']],
    stretch: [['holdSec', '单侧保持秒']],
    stretchSingle: [['holdSec', '保持秒']]
  };

  let appSettings = Storage.loadSettings();

  function fieldList(ex) {
    if (ex.type === 'warmup') return EXERCISE_FIELDS.warmup;
    if (ex.type === 'resistance') return ex.sides ? EXERCISE_FIELDS.resistance : EXERCISE_FIELDS.resistanceSingle;
    return ex.sides ? EXERCISE_FIELDS.stretch : EXERCISE_FIELDS.stretchSingle;
  }

  function render() {
    el.settingRate.value = String(appSettings.rate);
    el.settingVolume.value = String(appSettings.volume);
    el.settingBeep.value = String(appSettings.beepBeforeEnd);
    el.rateValue.textContent = el.settingRate.value;
    el.volumeValue.textContent = el.settingVolume.value;
    const ambient = appSettings.ambient || { enabled: true, type: 'dawn', volume: 0.3 };
    el.settingAmbientEnabled.checked = !!ambient.enabled;
    el.settingAmbientDucking.checked = ambient.ducking === true;
    el.settingAmbientType.value = ambient.type || 'beat';
    el.settingAmbientVolume.value = String(ambient.volume);
    el.ambientVolumeValue.textContent = el.settingAmbientVolume.value;
    renderExerciseConfigs();
  }

  function renderExerciseConfigs() {
    el.exerciseConfigs.textContent = '';
    appSettings.exercises.forEach((ex) => {
      const block = document.createElement('div');
      block.className = 'ex-config';
      const title = document.createElement('h3');
      title.textContent = ex.name;
      block.appendChild(title);
      fieldList(ex).forEach(([key, label]) => {
        block.appendChild(buildNumberField(ex.id, ex.name, key, label, ex[key]));
      });
      el.exerciseConfigs.appendChild(block);
    });
  }

  function buildNumberField(exId, exName, key, label, value) {
    const row = document.createElement('label');
    row.className = 'field-row';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = key === 'restSec' ? '120' : '60';
    input.value = String(value);
    input.setAttribute('aria-label', `${exName} ${label}`);
    input.addEventListener('change', () => {
      const num = Math.max(1, Math.floor(Number(input.value)) || 1);
      input.value = String(num);
      updateExerciseSetting(exId, key, num);
    });
    row.appendChild(span);
    row.appendChild(input);
    return row;
  }

  function updateExerciseSetting(exId, key, value) {
    appSettings = {
      ...appSettings,
      exercises: appSettings.exercises.map((ex) => (ex.id === exId ? { ...ex, [key]: value } : ex))
    };
    Storage.saveSettings(appSettings);
  }

  function currentSettings() {
    return appSettings;
  }

  function init() {
    el.settingRate.addEventListener('input', () => {
      el.rateValue.textContent = el.settingRate.value;
      appSettings = { ...appSettings, rate: Number(el.settingRate.value) };
      Storage.saveSettings(appSettings);
    });
    el.settingVolume.addEventListener('input', () => {
      el.volumeValue.textContent = el.settingVolume.value;
      appSettings = { ...appSettings, volume: Number(el.settingVolume.value) };
      Storage.saveSettings(appSettings);
    });
    el.settingBeep.addEventListener('change', () => {
      const num = Math.min(60, Math.max(1, Math.floor(Number(el.settingBeep.value)) || 5));
      el.settingBeep.value = String(num);
      appSettings = { ...appSettings, beepBeforeEnd: num };
      Storage.saveSettings(appSettings);
    });
    el.btnReset.addEventListener('click', () => {
      appSettings = Storage.resetSettings();
      render();
    });
    el.settingAmbientEnabled.addEventListener('change', () => {
      appSettings = {
        ...appSettings,
        ambient: { ...(appSettings.ambient || {}), enabled: el.settingAmbientEnabled.checked }
      };
      Storage.saveSettings(appSettings);
    });
    el.settingAmbientDucking.addEventListener('change', () => {
      appSettings = {
        ...appSettings,
        ambient: { ...(appSettings.ambient || {}), ducking: el.settingAmbientDucking.checked }
      };
      Storage.saveSettings(appSettings);
    });
    el.settingAmbientType.addEventListener('change', () => {
      appSettings = {
        ...appSettings,
        ambient: { ...(appSettings.ambient || {}), type: el.settingAmbientType.value }
      };
      Storage.saveSettings(appSettings);
    });
    el.settingAmbientVolume.addEventListener('input', () => {
      const vol = Number(el.settingAmbientVolume.value);
      el.ambientVolumeValue.textContent = el.settingAmbientVolume.value;
      appSettings = {
        ...appSettings,
        ambient: { ...(appSettings.ambient || {}), volume: vol }
      };
      Storage.saveSettings(appSettings);
    });
  }

  return { init, render, currentSettings };
})();
