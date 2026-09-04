/**
 * audio.js
 * 音频管理器：中文语音合成（Web Speech API）+ 蜂鸣（Web Audio API）。
 * 两个系统互相独立，可同时发声。
 * 语音失败时用定时器兜底推进流程，绝不无限等待。
 */
class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.voice = null;
    this.voicesLoaded = false;
    this.speechAvailable = false;
    this.beepAvailable = false;
    this.lastSpeechToken = 0;
    this._boundLoadVoices = this._loadVoices.bind(this);
  }

  /** 必须在用户手势（开始按钮）中调用：解锁 AudioContext、加载中文语音。 */
  init() {
    this._initAudioContext();
    this._initSpeech();
    return { speechAvailable: this.speechAvailable, beepAvailable: this.beepAvailable };
  }

  _initAudioContext() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('AudioContext 不可用');
      if (!this.audioCtx) this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      this.beepAvailable = true;
    } catch (err) {
      console.warn('[audio] AudioContext 初始化失败', err);
    this.beepAvailable = false;
    this.duckingEnabled = true;
    }
  }

  _initSpeech() {
    try {
      if (!('speechSynthesis' in window)) throw new Error('speechSynthesis 不可用');
      this.speechAvailable = true;
      this._loadVoices();
      window.speechSynthesis.addEventListener('voiceschanged', this._boundLoadVoices);
    } catch (err) {
      console.warn('[audio] 语音合成不可用', err);
      this.speechAvailable = false;
    }
  }

  /** 加载并选择中文语音：优先 zh-CN，其次任意 zh，最后默认。 */
  _loadVoices() {
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      this.voicesLoaded = true;
      this.voice = this.getChineseVoice();
    } catch (err) {
      console.warn('[audio] 语音列表加载失败', err);
    }
  }

  /** 返回最合适的中文语音（外部可取用）。 */
  getChineseVoice() {
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return null;
      const zh = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
      if (zh.length === 0) return null;
      const cn = zh.find((v) => v.lang.toLowerCase() === 'zh-cn');
      const hans = zh.find((v) => /zh-cn|zh-hans|cmn/i.test(v.lang));
      return cn || hans || zh[0];
    } catch (err) {
      return null;
    }
  }

  /** 估算文本朗读时长（毫秒），作为 onEnd 的兜底超时。 */
  _estimateDurationMs(text) {
    const seconds = Math.min(3 + text.length * 0.22, 30);
    return seconds * 1000;
  }

  /** 朗读中文文本。onEnd 保证只触发一次（onend 或超时兜底）。 */
  speak(text, options = {}) {
    const opts = { rate: 1.0, volume: 1.0, onEnd: null, ...options };
    const token = ++this.lastSpeechToken;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof opts.onEnd === 'function') opts.onEnd();
    };

    if (!this.speechAvailable || !text) {
      setTimeout(finish, this._estimateDurationMs(text || ''));
      return token;
    }

    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = this.voice ? this.voice.lang : 'zh-CN';
      if (this.voice) utter.voice = this.voice;
      utter.rate = Math.min(2, Math.max(0.5, Number(opts.rate) || 1));
      utter.volume = Math.min(1, Math.max(0, Number(opts.volume) || 1));
      utter.pitch = 1;
      this.duckDown();
      utter.onend = () => { if (token === this.lastSpeechToken) { this.duckUp(); finish(); } };
      utter.onerror = () => { if (token === this.lastSpeechToken) { this.duckUp(); finish(); } };
      window.speechSynthesis.speak(utter);
    } catch (err) {
      console.warn('[audio] 朗读失败', err);
      this.duckUp();
      setTimeout(finish, 300);
      return token;
    }

    setTimeout(() => {
      if (token === this.lastSpeechToken) { this.duckUp(); finish(); }
    }, this._estimateDurationMs(text));
    return token;
  }

  /** 快速朗读单个数字/短词（用于计数与倒数）。先取消待播语音，防止队列堆积。 */
  speakCount(word, options = {}) {
    const opts = { rate: 1.1, volume: 1.0, ...options };
    if (!this.speechAvailable) return;
    try {
      window.speechSynthesis.cancel();
      this.duckDown();
      const utter = new SpeechSynthesisUtterance(String(word));
      utter.lang = this.voice ? this.voice.lang : 'zh-CN';
      if (this.voice) utter.voice = this.voice;
      utter.rate = Math.min(2, Math.max(0.5, Number(opts.rate) || 1.1));
      utter.volume = Math.min(1, Math.max(0, Number(opts.volume) || 1));
      utter.pitch = 1;
      utter.onend = () => this.duckUp();
      utter.onerror = () => this.duckUp();
      window.speechSynthesis.speak(utter);
      setTimeout(() => this.duckUp(), 2000);
    } catch (err) {
      console.warn('[audio] 计数朗读失败', err);
      this.duckUp();
    }
  }

  /** 短促蜂鸣：默认 880Hz 正弦波 150ms，带淡入淡出避免爆音。 */
  beep(options = {}) {
    const opts = { frequency: 880, duration: 0.15, volume: 0.5, ...options };
    if (!this.beepAvailable || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(Number(opts.frequency) || 880, now);
      const peak = Math.min(1, Math.max(0, Number(opts.volume) || 0.5));
      const duration = Number(opts.duration) || 0.15;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (err) {
      console.warn('[audio] 蜂鸣播放失败', err);
    }
  }

  /** 取消所有排队与播放中的语音。 */
  cancelSpeech() {
    this.lastSpeechToken++;
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (err) {
      console.warn('[audio] 取消语音失败', err);
    }
    this.duckUp();
  }

  // ---------- 环境音 ----------
  // 用 Web Audio API 程序生成低频氛围音，零文件体积，离线可用。
  // 语音播报时自动压低音量（ducking），播完恢复。

  startAmbient({ type = 'beat', volume = 0.3 } = {}) {
    this.stopAmbient();
    if (!this.beepAvailable || !this.audioCtx) return;

    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const ctx = this.audioCtx;
      const now = ctx.currentTime;
      const safeVol = Math.min(1, Math.max(0, Number(volume) || 0.3));

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.exponentialRampToValueAtTime(safeVol, now + 2);
      masterGain.connect(ctx.destination);

      const nodes = [masterGain];

      if (type === 'rain') {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.5;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.5;

        noise.connect(filter);
        filter.connect(masterGain);
        noise.start(now);
        nodes.push(noise, filter);
      } else if (type === 'beat') {
        const beatSec = 60 / 90;
        const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
          noiseData[i] = Math.random() * 2 - 1;
        }

        let beatIdx = 0;
        const scheduleBeat = () => {
          const t = ctx.currentTime;
          if (beatIdx % 2 === 0) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
            osc.connect(g);
            g.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.2);
          } else {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            const filt = ctx.createBiquadFilter();
            filt.type = 'highpass';
            filt.frequency.value = 6000;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.15, t + 0.001);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
            src.connect(filt);
            filt.connect(g);
            g.connect(masterGain);
            src.start(t);
            src.stop(t + 0.05);
          }
          beatIdx++;
        };

        scheduleBeat();
        this.ambientBeatTimer = setInterval(scheduleBeat, (beatSec / 2) * 1000);
      } else {
        const freqs = [523.25, 659.25, 783.99];
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;

          const oscGain = ctx.createGain();
          oscGain.gain.value = 0.22;

          const lfo = ctx.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 0.10 + i * 0.04;

          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 0.08;

          lfo.connect(lfoGain);
          lfoGain.connect(oscGain.gain);

          osc.connect(oscGain);
          oscGain.connect(masterGain);

          osc.start(now);
          lfo.start(now);
          nodes.push(osc, oscGain, lfo, lfoGain);
        });

        const shimmer = ctx.createOscillator();
        shimmer.type = 'sine';
        shimmer.frequency.value = 1046.50;
        const shimmerGain = ctx.createGain();
        shimmerGain.gain.value = 0.06;
        const shimmerLfo = ctx.createOscillator();
        shimmerLfo.type = 'sine';
        shimmerLfo.frequency.value = 0.15;
        const shimmerLfoGain = ctx.createGain();
        shimmerLfoGain.gain.value = 0.03;
        shimmerLfo.connect(shimmerLfoGain);
        shimmerLfoGain.connect(shimmerGain.gain);
        shimmer.connect(shimmerGain);
        shimmerGain.connect(masterGain);
        shimmer.start(now);
        shimmerLfo.start(now);
        nodes.push(shimmer, shimmerGain, shimmerLfo, shimmerLfoGain);
      }

      this.ambientNodes = nodes;
      this.ambientGain = masterGain;
      this.ambientVolume = safeVol;
      console.info(`[audio] 环境音启动: ${type}`);
    } catch (err) {
      console.warn('[audio] 环境音启动失败', err);
    }
  }

  stopAmbient() {
    if (!this.ambientNodes) return;
    if (this.ambientBeatTimer) {
      clearInterval(this.ambientBeatTimer);
      this.ambientBeatTimer = null;
    }
    try {
      const ctx = this.audioCtx;
      const now = ctx ? ctx.currentTime : 0;
      if (this.ambientGain && ctx) {
        this.ambientGain.gain.cancelScheduledValues(now);
        this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
        this.ambientGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      }
      const nodes = this.ambientNodes;
      setTimeout(() => {
        nodes.forEach((n) => {
          try { if (n.stop) n.stop(); } catch (_) {}
          try { n.disconnect(); } catch (_) {}
        });
      }, 600);
    } catch (err) {
      console.warn('[audio] 环境音停止失败', err);
    }
    this.ambientNodes = null;
    this.ambientGain = null;
  }

  duckDown() {
    if (!this.ambientGain || !this.audioCtx) return;
    if (!this.duckingEnabled) return;
    try {
      const now = this.audioCtx.currentTime;
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
      this.ambientGain.gain.linearRampToValueAtTime(this.ambientVolume * 0.2, now + 0.3);
    } catch (_) {}
  }

  duckUp() {
    if (!this.ambientGain || !this.audioCtx) return;
    if (!this.duckingEnabled) return;
    try {
      const now = this.audioCtx.currentTime;
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
      this.ambientGain.gain.linearRampToValueAtTime(this.ambientVolume, now + 0.5);
    } catch (_) {}
  }
}
