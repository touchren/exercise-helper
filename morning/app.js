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
    btnSettings: $('btn-settings'),
    btnRecords: $('btn-records'),
    btnBackHome: $('btn-back-home'),
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
    modalActions: $('modal-actions'),
    btnConfirmYes: $('btn-confirm-yes'),
    btnConfirmNo: $('btn-confirm-no'),
    btnConfirmPauseLeave: $('btn-confirm-pause-leave')
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
  let recommendedMode = 'full';       // 系统建议模式（判定）
  let currentMode = 'full';            // 用户当前选择（仅本次，不持久化）
  let sessionMode = 'full';            // 训练开始时锁定，保存记录用

  el.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  // ---------- 屏幕导航 ----------
  function showScreen(name) {
    Object.keys(el.screens).forEach((key) => {
      el.screens[key].classList.toggle('active', key === name);
    });
    if (name === 'records') RecordsUI.render();
    if (name === 'settings') SettingsUI.render();
  }

  el.btnSettings.addEventListener('click', () => {
    showScreen('settings');
    window.history.pushState({ screen: 'settings' }, '');
  });
  el.btnRecords.addEventListener('click', () => {
    showScreen('records');
    window.history.pushState({ screen: 'records' }, '');
  });
  // UI 返回按钮走 history.back()，与 Android 返回手势走同一路径
  el.btnBackSettings.addEventListener('click', () => window.history.back());
  el.btnBackRecords.addEventListener('click', () => window.history.back());

  // Android 返回手势拦截：子页面时返回关闭子页面，主屏返回退出到选择页
  if (window.history && window.history.pushState) {
    // 页面加载时 push 哨兵条目，主屏按返回时由此触发 goBackToSelector
    window.history.pushState({ screen: 'main' }, '');
    window.addEventListener('popstate', () => {
      const openName = Object.keys(el.screens).find((k) => k !== 'main' && el.screens[k].classList.contains('active'));
      if (openName) {
        // 子页面返回：切回主屏（pop 已消费子页面条目，无需再 push）
        showScreen('main');
      } else {
        // 主屏返回：退出到选择页
        goBackToSelector();
      }
    });
  }

  // 返回运动选择页（父目录）
  function goBackToSelector() {
    const navigate = () => {
      // 告知选择页用户是主动返回，不再自动匹配
      sessionStorage.setItem('selector:returned', 'true');
      window.location.href = '../';
    };
    if (workoutState === 'running' || workoutState === 'paused') {
      // 用户可能取消，重新 push 哨兵恢复返回拦截能力
      if (window.history && window.history.pushState) {
        window.history.pushState({ screen: 'main' }, '');
      }
      showBackConfirm(
        () => {
          // 暂停并离开：暂停引擎后离开（不保存记录）
          if (engine && workoutState === 'running') {
            engine.pause();
          }
          stopElapsedTimer();
          audio.stopAmbient();
          releaseWakeLock();
          navigate();
        },
        () => {
          // 直接离开：停止引擎并保存记录
          const stats = engine ? engine.stop() : null;
          if (stats) saveRecord(stats);
          resetWorkoutUi();
          navigate();
        }
      );
      return;
    }
    navigate();
  }
  el.btnBackHome.addEventListener('click', goBackToSelector);

  // ---------- 确认弹窗（替代 alert/confirm） ----------
  let confirmHandler = null;
  let confirmPauseLeaveHandler = null;
  function showConfirm(text, onYes) {
    confirmHandler = onYes;
    confirmPauseLeaveHandler = null;
    el.modalText.textContent = text;
    el.btnConfirmYes.textContent = '确认';
    el.btnConfirmPauseLeave.classList.add('hidden');
    el.modalActions.classList.remove('modal-actions--back');
    el.modalConfirm.classList.remove('hidden');
  }
  // 三按钮返回确认：暂停并离开 / 直接离开 / 取消
  function showBackConfirm(onPauseLeave, onDirectLeave) {
    confirmHandler = onDirectLeave;
    confirmPauseLeaveHandler = onPauseLeave;
    el.modalText.textContent = '训练进行中，确定离开？';
    el.btnConfirmYes.textContent = '直接离开';
    el.btnConfirmPauseLeave.classList.remove('hidden');
    el.modalActions.classList.add('modal-actions--back');
    el.modalConfirm.classList.remove('hidden');
  }
  function hideConfirm() {
    el.modalConfirm.classList.add('hidden');
    confirmHandler = null;
    confirmPauseLeaveHandler = null;
  }
  el.btnConfirmYes.addEventListener('click', () => {
    const handler = confirmHandler;
    hideConfirm();
    if (typeof handler === 'function') handler();
  });
  el.btnConfirmNo.addEventListener('click', hideConfirm);
  el.btnConfirmPauseLeave.addEventListener('click', () => {
    const handler = confirmPauseLeaveHandler;
    hideConfirm();
    if (typeof handler === 'function') handler();
  });

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

  function setPhaseName(text) {
    el.phaseName.textContent = text;
    el.phaseName.classList.remove('fade-in');
    void el.phaseName.offsetWidth;
    el.phaseName.classList.add('fade-in');
  }

  function renderIdleSub() {
    const settings = { ...SettingsUI.currentSettings(), mode: currentMode };
    const steps = buildStepSequence(settings.exercises, settings);
    if (currentMode === 'stretch') {
      const totalSec = steps.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
      const min = Math.max(1, Math.round(totalSec / 60));
      el.phaseSub.textContent = `放松 · 约${min}分钟`;
    } else {
      let resistanceSec = 0;
      for (const s of steps) {
        if (s.countsTowardResistance && s.duration) {
          resistanceSec += s.duration;
        }
      }
      const totalMin = Math.round((WORKOUT_META.totalSec || 0) / 60);
      const resistanceMin = Math.round(resistanceSec / 60);
      el.phaseSub.textContent = `全程${totalMin}分钟 · 抗阻${resistanceMin}分钟`;
    }
  }

  function handleModeTap(newMode) {
    if (workoutState === 'running') return;
    if (newMode === currentMode) return;
    // 暂停态切换：停止引擎并回 idle
    if (workoutState === 'paused') {
      if (engine) {
        engine.stop();
        engine = null;
      }
      stopElapsedTimer();
      audio.stopAmbient();
      releaseWakeLock();
      workoutState = 'idle';
    }
    currentMode = newMode;
    renderModeSwitch();
    renderIdleUi();
    setControlsState();
  }

  el.btnModeFull.addEventListener('click', () => handleModeTap('full'));

  el.btnModeStretch.addEventListener('click', () => handleModeTap('stretch'));

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
    el.ringWrap.classList.remove('pulse');
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
    setPhaseName('晨练准备就绪');
    renderIdleSub();
    el.phaseStatus.textContent = '准备开始';
    el.phaseStatus.classList.remove('paused-text');
    el.tips.classList.add('hidden');
    el.tips.textContent = '';
    setRingProgress(null);
    el.elapsedTime.textContent = '00:00';
    el.ringWrap.classList.remove('breathing');
    el.ringWrap.classList.remove('pulse');
  }

  function setControlsState() {
    const active = workoutState === 'running' || workoutState === 'paused';
    el.btnStart.disabled = active;
    el.btnPause.disabled = !active;
    el.btnStop.disabled = !active;
    el.btnSkip.disabled = !active;
    el.btnPause.textContent = workoutState === 'paused' ? '继续' : '暂停';
    updateModeSwitchVisibility();
  }

  function updateModeSwitchVisibility() {
    if (!Storage.isAlternateDaysEnabled()) {
      el.modeSwitch.classList.add('hidden');
      return;
    }
    const show = workoutState === 'idle' || workoutState === 'done' || workoutState === 'paused';
    el.modeSwitch.classList.toggle('hidden', !show);
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
      setPhaseName('训练结束');
      el.phaseSub.textContent = '本次训练完成，辛苦了';
      el.phaseStatus.textContent = '已完成';
    } else {
      const setPart = phase.setNumber ? ` · 第${phase.setNumber}组/${phase.totalSets}组` : '';
      setPhaseName(`${phase.exerciseName || ''}${setPart}`);
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
      el.ringWrap.classList.add('breathing');
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
    setPhaseName('训练结束');
    if (sessionMode === 'stretch') {
      el.phaseSub.textContent = `用时 ${formatDuration(stats.totalTimeSec)} · 放松训练`;
    } else {
      el.phaseSub.textContent = `用时 ${formatDuration(stats.totalTimeSec)} · 抗阻 ${formatMinutes(stats.resistanceTimeSec)} 分钟`;
    }
    el.phaseStatus.textContent = '辛苦了';
    el.ringWrap.classList.remove('breathing');
    setRingProgress(1);
    el.ringWrap.classList.remove('pulse');
    void el.ringWrap.offsetWidth;
    el.ringWrap.classList.add('pulse');
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
      navigator.serviceWorker.register('./sw.js').then(() => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          location.reload();
        });
      }).catch((err) => {
        console.warn('[app] Service Worker 注册失败', err);
      });
    });
  }

  // ---------- 初始化 ----------
  SettingsUI.init();
  RecordsUI.init({ showConfirm });
  initModeSwitch();
  renderIdleUi();
  setControlsState();
})();
