/**
 * engine.js
 * 训练状态机与计时编排。
 * 单条 1 秒 tick 循环驱动全部定时步骤；语音步骤由 onEnd + 超时兜底驱动。
 * 所有 Web API 调用均经 try-catch 包装，语音失败不会卡住流程。
 */
class WorkoutEngine {
  /**
   * @param {Object} deps
   * @param {AudioManager} deps.audio 音频管理器实例
   * @param {Object} deps.settings 全局设置（含 exercises）
   * @param {Object} deps.callbacks 回调集合
   */
  constructor({ audio, settings, callbacks }) {
    this.audio = audio;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.callbacks = callbacks || {};

    this.state = 'idle';            // idle | running | paused | done
    this.steps = [];
    this.stepIndex = 0;
    this.currentStep = null;
    this.events = [];               // 当前步骤的事件表 { at, run, fired }
    this.timerId = null;            // tick 定时器
    this.pauseTimerId = null;       // transition 停顿定时器
    this.speechStepActive = false;  // 语音步骤是否在等待 onEnd
    this.phaseElapsed = 0;          // 当前步骤已过秒数
    this.stepStartTs = 0;           // 当前步骤基准时间戳
    this.startTs = 0;               // 训练开始时间戳
    this.pauseStartTs = null;
    this.totalPausedMs = 0;
    this.resistanceSec = 0;         // 抗阻运动累计秒数（不含休息）
  }

  start() {
    if (this.state === 'running' || this.state === 'paused') return;
    this.steps = buildStepSequence(this.settings.exercises, this.settings);
    this.stepIndex = 0;
    this.resistanceSec = 0;
    this.totalPausedMs = 0;
    this.startTs = Date.now();
    this.state = 'running';
    this._startStep(0);
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.pauseStartTs = Date.now();
    this._clearTimers();
    this.speechStepActive = false;
    this.audio.cancelSpeech();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.totalPausedMs += Date.now() - (this.pauseStartTs || Date.now());
    this.pauseStartTs = null;

    if (this._isSpeechDriven(this.currentStep)) {
      this._runSpeechStep(this.currentStep);
      return;
    }
    this._resumeTimedStep();
  }

  /** 中止训练，返回统计（completed 为 false）。 */
  stop() {
    if (this.state === 'idle' || this.state === 'done') return null;
    this._addPartialResistanceTime();
    this._clearTimers();
    this.speechStepActive = false;
    this.audio.cancelSpeech();
    const stats = this._buildStats(false);
    this.state = 'idle';
    return stats;
  }

  /** 跳过当前步骤，直接进入下一步骤（含从暂停状态跳过）。 */
  skipPhase() {
    if (this.state !== 'running' && this.state !== 'paused') return;
    if (this.pauseStartTs != null) {
      this.totalPausedMs += Date.now() - this.pauseStartTs;
      this.pauseStartTs = null;
    }
    this._addPartialResistanceTime();
    this._clearTimers();
    this.speechStepActive = false;
    this.audio.cancelSpeech();
    this.state = 'running';
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) {
      this._finish();
    } else {
      this._startStep(this.stepIndex);
    }
  }

  _isSpeechDriven(step) {
    return step.type === 'announce' || step.type === 'transition' || step.type === 'complete';
  }

  _startStep(index) {
    const step = this.steps[index];
    if (!step) {
      this._finish();
      return;
    }
    this.currentStep = step;
    this.phaseElapsed = 0;
    this.events = this._buildEvents(step);
    this._emitPhase(step);

    if (this._isSpeechDriven(step)) {
      this._runSpeechStep(step);
      return;
    }
    this.stepStartTs = Date.now();
    this.timerId = setInterval(() => this._tick(), 1000);
    this._tick();
  }

  _runSpeechStep(step) {
    this.speechStepActive = true;
    const handleDone = () => {
      if (!this.speechStepActive || this.state !== 'running') return;
      this.speechStepActive = false;
      if (step.type === 'transition' && step.pauseSec > 0) {
        this.pauseTimerId = setTimeout(() => this._advanceFromSpeechStep(step), step.pauseSec * 1000);
      } else {
        this._advanceFromSpeechStep(step);
      }
    };
    this.audio.speak(step.tts, {
      rate: this.settings.rate,
      volume: this.settings.volume,
      onEnd: handleDone
    });
  }

  _advanceFromSpeechStep(step) {
    if (step.countsTowardResistance) {
      this.resistanceSec += (step.pauseSec || 0) + 1.5;
    }
    this.stepIndex++;
    this._startStep(this.stepIndex);
  }

  _resumeTimedStep() {
    this.stepStartTs = Date.now() - this.phaseElapsed * 1000;
    for (const ev of this.events) {
      if (!ev.fired && ev.at <= this.phaseElapsed) ev.fired = true;
    }
    this.timerId = setInterval(() => this._tick(), 1000);
  }

  _tick() {
    if (this.state !== 'running') return;
    const step = this.currentStep;
    const elapsed = Math.floor((Date.now() - this.stepStartTs) / 1000);
    this.phaseElapsed = elapsed;
    this._fireEvents(elapsed);
    if (typeof this.callbacks.onTick === 'function') {
      const remaining = step.duration != null ? Math.max(0, step.duration - elapsed) : null;
      this.callbacks.onTick(remaining);
    }
    if (step.duration != null && elapsed >= step.duration) {
      this._finishStep();
    }
  }

  _fireEvents(elapsed) {
    for (const ev of this.events) {
      if (!ev.fired && elapsed >= ev.at) {
        ev.fired = true;
        try {
          ev.run();
        } catch (err) {
          console.warn('[engine] 事件执行失败', err);
        }
      }
    }
  }

  _finishStep() {
    const step = this.currentStep;
    if (step.countsTowardResistance && step.duration != null) {
      this.resistanceSec += step.duration;
    }
    this._clearTimers();
    this.stepIndex++;
    this._startStep(this.stepIndex);
  }

  _addPartialResistanceTime() {
    const step = this.currentStep;
    if (!step || !step.countsTowardResistance) return;
    if (this._isSpeechDriven(step)) {
      this.resistanceSec += step.pauseSec || 0;
    } else if (step.duration != null && this.phaseElapsed > 0) {
      this.resistanceSec += this.phaseElapsed;
    }
  }

  _buildEvents(step) {
    const events = [];
    const beepBefore = this._clamp(this.settings.beepBeforeEnd, 0, 60, 5);
    const addBeep = (at) => {
      for (let i = 0; i < beepBefore - 1; i++) {
        events.push({ at: at + i, run: () => this.audio.beep({}) });
      }
      events.push({ at: step.duration - 1, run: () => this.audio.beep({ frequency: 1320, duration: 0.3, volume: 0.7 }) });
    };

    if (step.type === 'countdown') {
      step.tokens.forEach((token, i) => {
        events.push({ at: i, run: () => this.audio.speakCount(token) });
      });
      return events;
    }

    if (step.type === 'count_reps') {
      for (let n = 1; n <= step.count; n++) {
        const at = (n - 1) * step.cadence;
        events.push({
          at,
          run: () => {
            this.audio.speakCount(n);
            if (typeof this.callbacks.onRepCount === 'function') {
              this.callbacks.onRepCount(n, step.count);
            }
          }
        });
      }
      addBeep(step.duration - beepBefore);
      return events;
    }

    if (step.type === 'hold') {
      if (step.breathing) {
        for (let t = 0; t < step.duration - 1; t += 5) {
          const word = t % 10 === 0 ? '吸气' : '呼气';
          events.push({ at: t, run: () => this.audio.speakCount(word) });
        }
      }
      addBeep(step.duration - beepBefore);
      return events;
    }

    if (step.type === 'rest') {
      events.push({ at: 0, run: () => this.audio.speak(step.tts, { rate: this.settings.rate, volume: this.settings.volume }) });
      events.push({ at: step.duration - 10, run: () => this.audio.speakCount('剩余10秒') });
      addBeep(step.duration - beepBefore);
      return events;
    }

    return events;
  }

  _emitPhase(step) {
    if (typeof this.callbacks.onPhaseChange !== 'function') return;
    this.callbacks.onPhaseChange({
      exerciseName: step.exerciseName,
      setNumber: step.setNumber,
      totalSets: step.totalSets,
      side: step.side,
      sideName: step.sideName,
      phaseType: step.phaseType,
      stepType: step.type,
      remainingSec: step.duration != null ? step.duration : null,
      totalSec: step.duration != null ? step.duration : null,
      repCount: 0,
      repTarget: step.count != null ? step.count : null,
      tips: step.tips || null
    });
  }

  _finish() {
    this._clearTimers();
    this.audio.cancelSpeech();
    const stats = this._buildStats(true);
    this.state = 'done';
    if (typeof this.callbacks.onComplete === 'function') {
      this.callbacks.onComplete(stats);
    }
  }

  _buildStats(completed) {
    const elapsedMs = Math.max(0, Date.now() - this.startTs - this.totalPausedMs);
    return {
      totalTimeSec: Math.round(elapsedMs / 1000),
      resistanceTimeSec: Math.round(this.resistanceSec),
      completed
    };
  }

  _clearTimers() {
    if (this.timerId != null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.pauseTimerId != null) {
      clearTimeout(this.pauseTimerId);
      this.pauseTimerId = null;
    }
  }

  _clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  }
}
