/**
 * app.js
 * UI 主控制器：屏幕导航、训练控制、主屏渲染、Wake Lock、安装提示、SW 注册。
 * 设置屏与记录屏分别由 SettingsUI / RecordsUI 模块负责。
 */
(() => {
  'use strict';

  // ---------- DOM 引用 ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    screens: { main: $('screen-main'), settings: $('screen-settings'), records: $('screen-records') },
    phaseName: $('phase-name'),
    phaseSub: $('phase-sub'),
    phaseStatus: $('phase-status'),
    elapsedTime: $('elapsed-time'),
    tips: $('tips'),
    ringProgress: $('ring-progress'),
    ringWrap: $('ring-wrap'),
    modeSwitch: $('mode-switch'),
    modeBadge: $('mode-badge'),
    btnModeFull: $('btn-mode-full'),
    btnModeStretch: $('btn-mode-stretch'),
    btnStart: $('btn-start'),
    btnPause: $('btn-pause'),
    btnStop: $('btn-stop'),
    btnSkip: $('btn-skip'),
    btnBackHome: $('btn-back-home'),
    btnSettings: $('btn-settings'),
    btnRecords: $('btn-records'),
    btnBackSettings: $('btn-back-settings'),
    btnBackRecords: $('btn-back-records'),
    installBanner: $('install-banner'),
    btnInstall: $('btn-install'),
    btnInstallDismiss: $('btn-install-dismiss'),
    warningBanner: $('warning-banner'),
    warningText: $('warning-text'),
    btnWarningDismiss: $('btn-warning-dismiss'),
    modalConfirm: $('modal-confirm'),
    modalText: $('modal-text'),
    btnConfirmYes: $('btn-confirm-yes'),
    btnConfirmNo: $('btn-confirm-no')
  };

  // ---------- 全局状态 ----------
  const RING_CIRCUMFERENCE = 2 * Math.PI * 54;
  const audio = new AudioManager();
  let engine = null;
  let workoutState = 'idle';          // idle | running | paused | done
  let currentPhase = null;
  let elapsedSec = 0;
  let elapsedTimerId = null;
  let wakeLockSentinel = null;
  let noSleepVideo = null;
  let noSleepCanvas = null;
  let noSleepRafId = null;
  let wakeLockActive = false;
  let deferredInstallPrompt = null;
  let recommendedMode = 'full';
  let currentMode = 'full';
  let sessionMode = 'full';

  el.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  // ---------- 屏幕导航 ----------
  function showScreen(name) {
    Object.keys(el.screens).forEach((key) => {
      el.screens[key].classList.toggle('active', key === name);
    });
    if (name === 'records') RecordsUI.render();
    if (name === 'settings') SettingsUI.render();
  }

  el.btnSettings.addEventListener('click', () => showScreen('settings'));
  el.btnRecords.addEventListener('click', () => showScreen('records'));
  el.btnBackSettings.addEventListener('click', () => showScreen('main'));
  el.btnBackRecords.addEventListener('click', () => showScreen('main'));

  // 返回运动选择页（父目录）
  function goBackToSelector() {
    const navigate = () => {
      // 用户主动返回，告知选择页不要再次自动匹配
      sessionStorage.setItem('selector:returned', 'true');
      window.location.href = '../';
    };
    if (workoutState === 'running' || workoutState === 'paused') {
      showConfirm('训练进行中，确定返回？返回后本次训练将结束。', () => {
        const stats = engine ? engine.stop() : null;
        if (stats) saveRecord(stats);
        navigate();
      });
    } else {
      navigate();
    }
  }
  el.btnBackHome.addEventListener('click', goBackToSelector);

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

  // ---------- 模式切换 ----------
  function initModeSwitch() {
    const enabled = Storage.isAlternateDaysEnabled();
    if (!enabled) {
      el.modeSwitch.classList.add('hidden');
      recommendedMode = 'full';
      currentMode = 'full';
      return;
    }
    recommendedMode = Storage.getRecommendedMode();
    currentMode = recommendedMode;
    el.modeSwitch.classList.remove('hidden');
    renderModeSwitch();
  }

  function renderModeSwitch() {
    el.btnModeFull.classList.toggle('active', currentMode === 'full');
    el.btnModeStretch.classList.toggle('active', currentMode === 'stretch');
    const isRecommended = currentMode === recommendedMode;
    el.modeBadge.textContent = isRecommended ? '系统建议' : '手动选择';
    el.modeBadge.classList.toggle('recommended', isRecommended);
    el.modeBadge.classList.toggle('manual', !isRecommended);
  }

  function renderIdleSub() {
    if (currentMode === 'stretch') {
      const settings = { ...SettingsUI.currentSettings(), mode: 'stretch' };
      const steps = buildStepSequence(settings.exercises, settings);
      const totalSec = steps.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
      const min = Math.max(1, Math.round(totalSec / 60));
      el.phaseSub.textContent = `放松 · 约${min}分钟`;
    } else {
      el.phaseSub.textContent = '全程20分钟 · 抗阻8分钟';
    }
  }

  el.btnModeFull.addEventListener('click', () => {
    if (workoutState === 'running' || workoutState === 'paused') return;
    currentMode = 'full';
    renderModeSwitch();
    renderIdleSub();
  });

  el.btnModeStretch.addEventListener('click', () => {
    if (workoutState === 'running' || workoutState === 'paused') return;
    currentMode = 'stretch';
    renderModeSwitch();
    renderIdleSub();
  });

  // ---------- 训练控制 ----------
  el.btnStart.addEventListener('click', () => {
    if (workoutState === 'running' || workoutState === 'paused') return;
    startWorkout();
  });

    el.btnPause.addEventListener('click', () => {
    if (!engine) return;
    if (workoutState === 'running') {
      engine.pause();
      workoutState = 'paused';
      stopElapsedTimer();
      el.btnPause.textContent = '继续';
      el.phaseStatus.textContent = '已暂停';
      el.phaseStatus.classList.add('paused-text');
      setControlsState();
    } else if (workoutState === 'paused') {
      engine.resume();
      workoutState = 'running';
      startElapsedTimer();
      el.btnPause.textContent = '暂停';
      el.phaseStatus.classList.remove('paused-text');
      renderPhase(currentPhase);
      setControlsState();
    }
  });

  el.btnStop.addEventListener('click', () => {
    if (workoutState !== 'running' && workoutState !== 'paused') return;
    showConfirm('确定要结束本次训练吗？未完成的部分将不会记录。', () => {
      const stats = engine ? engine.stop() : null;
      if (stats) saveRecord(stats);
      resetWorkoutUi();
    });
  });

  el.btnSkip.addEventListener('click', () => {
    if (!engine) return;
    if (workoutState === 'running' || workoutState === 'paused') {
      if (workoutState === 'paused') {
        workoutState = 'running';
        startElapsedTimer();
        el.btnPause.textContent = '暂停';
        el.phaseStatus.classList.remove('paused-text');
      }
      engine.skipPhase();
      setControlsState();
    }
  });

  function startWorkout() {
    const availability = audio.init();
    if (!availability.speechAvailable || !availability.beepAvailable) {
      showWarning(availability);
    }
    sessionMode = currentMode;
    const settings = { ...SettingsUI.currentSettings(), mode: currentMode };
    if (settings.ambient && settings.ambient.enabled) {
      audio.startAmbient({ type: settings.ambient.type || 'beat', volume: settings.ambient.volume || 0.3 });
      audio.duckingEnabled = settings.ambient.ducking === true;
    }
    engine = new WorkoutEngine({
      audio,
      settings,
      callbacks: {
        onPhaseChange: handlePhaseChange,
        onTick: handleTick,
        onRepCount: handleRepCount,
        onComplete: handleComplete
      }
    });
    workoutState = 'running';
    elapsedSec = 0;
    renderElapsed();
    engine.start();
    startElapsedTimer();
    requestWakeLock();
    setControlsState();
  }

  function resetWorkoutUi() {
    workoutState = 'idle';
    currentPhase = null;
    currentMode = recommendedMode;
    stopElapsedTimer();
    audio.stopAmbient();
    releaseWakeLock();
    renderIdleUi();
    renderModeSwitch();
    setControlsState();
  }

  function renderIdleUi() {
    el.phaseName.textContent = '晚练准备就绪';
    renderIdleSub();
    el.phaseStatus.textContent = '准备开始';
    el.phaseStatus.classList.remove('paused-text');
    el.tips.classList.add('hidden');
    el.tips.textContent = '';
    setRingProgress(null);
    el.elapsedTime.textContent = '00:00';
    el.ringWrap.classList.remove('breathing');
  }

  function setControlsState() {
    const active = workoutState === 'running' || workoutState === 'paused';
    el.btnStart.disabled = active;
    el.btnPause.disabled = !active;
    el.btnStop.disabled = !active;
    el.btnSkip.disabled = !active;
    el.btnPause.textContent = workoutState === 'paused' ? '继续' : '暂停';
  }

  // ---------- 引擎回调 ----------
  const PHASE_TYPE_LABEL = {
    warmup: '热身',
    resistance: '抗阻训练',
    stretch: '拉伸放松',
    rest: '组间休息',
    complete: '训练完成'
  };

  function handlePhaseChange(phase) {
    currentPhase = phase;
    if (workoutState !== 'paused') renderPhase(phase);
  }

  function renderPhase(phase) {
    if (!phase) return;
    if (phase.phaseType === 'complete') {
      el.phaseName.textContent = '训练结束';
      el.phaseSub.textContent = '本次训练完成，辛苦了';
      el.phaseStatus.textContent = '已完成';
    } else {
      const setPart = phase.setNumber ? ` · 第${phase.setNumber}组/${phase.totalSets}组` : '';
      el.phaseName.textContent = `${phase.exerciseName || ''}${setPart}`;
      el.phaseSub.textContent = PHASE_TYPE_LABEL[phase.phaseType] || ' ';
    }

    if (phase.stepType === 'announce' || phase.stepType === 'countdown') {
      el.phaseStatus.textContent = '准备开始...';
      el.ringWrap.classList.add('breathing');
      setRingProgress(null);
    } else if (phase.stepType === 'transition') {
      el.phaseStatus.textContent = '换另一侧...';
      el.ringWrap.classList.add('breathing');
      setRingProgress(null);
    } else if (phase.stepType === 'count_reps') {
      el.ringWrap.classList.remove('breathing');
      el.phaseStatus.textContent = `${phase.sideName ? phase.sideName + ' · ' : ''}第${phase.repCount}次/${phase.repTarget}`;
      setRingProgress(phase.totalSec ? 0 : null);
    } else if (phase.stepType === 'hold') {
      el.ringWrap.classList.remove('breathing');
      el.phaseStatus.textContent = `保持中 · 剩余${phase.remainingSec}秒`;
      setRingProgress(phase.totalSec ? 0 : null);
    } else if (phase.stepType === 'rest') {
      el.ringWrap.classList.remove('breathing');
      el.phaseStatus.textContent = `休息 · 剩余${phase.remainingSec}秒`;
      setRingProgress(phase.totalSec ? 0 : null);
    }
    if (phase.tips) {
      el.tips.textContent = phase.tips;
      el.tips.classList.remove('hidden');
    } else {
      el.tips.classList.add('hidden');
    }
  }

  function handleTick(remainingSec) {
    if (workoutState !== 'running' || !currentPhase) return;
    currentPhase.remainingSec = remainingSec;
    if (currentPhase.stepType === 'hold') {
      el.phaseStatus.textContent = `保持中 · 剩余${remainingSec}秒`;
    } else if (currentPhase.stepType === 'rest') {
      el.phaseStatus.textContent = `休息 · 剩余${remainingSec}秒`;
    }
    if (currentPhase.totalSec) {
      const progress = (currentPhase.totalSec - remainingSec) / currentPhase.totalSec;
      setRingProgress(progress);
    }
  }

  function handleRepCount(n, target) {
    if (workoutState !== 'running' || !currentPhase) return;
    currentPhase.repCount = n;
    el.phaseStatus.textContent = `${currentPhase.sideName ? currentPhase.sideName + ' · ' : ''}第${n}次/${target}`;
    if (currentPhase.totalSec) {
      const progress = ((n - 1) * (currentPhase.totalSec / target)) / currentPhase.totalSec;
      setRingProgress(progress);
    }
  }

  function handleComplete(stats) {
    workoutState = 'done';
    stopElapsedTimer();
    audio.stopAmbient();
    releaseWakeLock();
    saveRecord(stats);
    el.phaseName.textContent = '训练结束';
    if (sessionMode === 'stretch') {
      el.phaseSub.textContent = `用时 ${formatDuration(stats.totalTimeSec)} · 放松训练`;
    } else {
      el.phaseSub.textContent = `用时 ${formatDuration(stats.totalTimeSec)} · 抗阻 ${formatMinutes(stats.resistanceTimeSec)} 分钟`;
    }
    el.phaseStatus.textContent = '辛苦了';
    el.ringWrap.classList.remove('breathing');
    setRingProgress(1);
    setControlsState();
  }

  function saveRecord(stats) {
    Storage.addRecord({
      date: new Date().toISOString(),
      totalTimeSec: stats.totalTimeSec,
      resistanceTimeSec: stats.resistanceTimeSec,
      completed: stats.completed,
      dayType: sessionMode
    });
  }

  // ---------- 进度环与计时 ----------
  function setRingProgress(progress) {
    if (progress == null) {
      el.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      return;
    }
    const clamped = Math.min(1, Math.max(0, Number(progress) || 0));
    el.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - clamped));
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    elapsedTimerId = setInterval(() => {
      elapsedSec++;
      renderElapsed();
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimerId != null) {
      clearInterval(elapsedTimerId);
      elapsedTimerId = null;
    }
  }

  function renderElapsed() {
    const min = Math.floor(elapsedSec / 60);
    const sec = elapsedSec % 60;
    el.elapsedTime.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function formatDuration(totalSec) {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}分${String(sec).padStart(2, '0')}秒`;
  }

  function formatMinutes(resistanceSec) {
    return Math.round((resistanceSec / 60) * 10) / 10;
  }

  // ---------- 屏幕常亮 ----------
  // 两层策略：优先 Wake Lock API（需 HTTPS），不可用时用 canvas+video 兜底（HTTP 也可用）
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && window.isSecureContext) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
        wakeLockActive = true;
        console.info('[app] Wake Lock API 生效');
        return;
      }
    } catch (err) {
      console.warn('[app] Wake Lock API 不可用（可能因 HTTP 非 secure context），启用视频兜底', err.message);
    }

    // canvas captureStream + 隐藏 video，HTTP 下也能阻止锁屏
    startNoSleepVideo();
  }

  function startNoSleepVideo() {
    if (noSleepVideo) {
      noSleepVideo.play().catch(() => {});
      return;
    }
    try {
      noSleepCanvas = document.createElement('canvas');
      noSleepCanvas.width = 2;
      noSleepCanvas.height = 2;
      const ctx = noSleepCanvas.getContext('2d');

      noSleepVideo = document.createElement('video');
      noSleepVideo.setAttribute('muted', '');
      noSleepVideo.setAttribute('playsinline', '');
      noSleepVideo.setAttribute('webkit-playsinline', '');
      noSleepVideo.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
      document.body.appendChild(noSleepVideo);

      const stream = noSleepCanvas.captureStream(1);
      noSleepVideo.srcObject = stream;
      noSleepVideo.play().then(() => {
        wakeLockActive = true;
        console.info('[app] 视频兜底生效（canvas captureStream）');
      }).catch((e) => {
        console.warn('[app] 视频兜底也失败，请手动调长屏幕超时', e);
      });

      // 持续绘制让 canvas stream 保持活跃
      const drawFrame = () => {
        if (!noSleepCanvas) return;
        ctx.fillStyle = `rgb(${Math.random() * 255 | 0},${Math.random() * 255 | 0},${Math.random() * 255 | 0})`;
        ctx.fillRect(0, 0, 2, 2);
        noSleepRafId = requestAnimationFrame(drawFrame);
      };
      drawFrame();
    } catch (e) {
      console.warn('[app] canvas captureStream 不可用，请手动调长屏幕超时', e);
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLockSentinel) {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
      }
    } catch (err) {
      console.warn('[app] 屏幕常亮释放失败', err);
    }
    if (noSleepVideo) {
      noSleepVideo.pause();
    }
    if (noSleepRafId) {
      cancelAnimationFrame(noSleepRafId);
      noSleepRafId = null;
    }
    wakeLockActive = false;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (workoutState === 'running' || workoutState === 'paused')) {
      requestWakeLock();
    }
  });

  // ---------- 警告与安装提示 ----------
  function showWarning(availability) {
    const problems = [];
    if (!availability.beepAvailable) problems.push('当前浏览器不支持蜂鸣音效');
    if (problems.length === 0) return;
    el.warningText.textContent = problems.join('；');
    el.warningBanner.classList.remove('hidden');
  }

  el.btnWarningDismiss.addEventListener('click', () => {
    el.warningBanner.classList.add('hidden');
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    el.installBanner.classList.remove('hidden');
  });

  el.btnInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
    el.installBanner.classList.add('hidden');
  });

  el.btnInstallDismiss.addEventListener('click', () => {
    el.installBanner.classList.add('hidden');
  });

  // ---------- Service Worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[app] Service Worker 注册失败', err);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      location.reload();
    });
  }

  // ---------- 初始化 ----------
  SettingsUI.init();
  RecordsUI.init({ showConfirm });
  initModeSwitch();
  renderIdleUi();
  setControlsState();
})();
