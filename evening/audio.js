/**
 * audio.js
 * 音频管理器：中文语音合成（Web Speech API）+ 蜂鸣（Web Audio API）。
 * 两个系统互相独立，可同时发声。
 * 语音失败时用定时器兜底推进流程，绝不无限等待。
 */

// 当前音色（tts/ 下的子文件夹名）。切换音色：把同名字的 mp3 放进新文件夹，只改此常量。
const TTS_VOICE = 'xiaoxiao';

/** 拼接预生成语音完整相对路径：tts/{音色}/{文件名}。 */
function _ttsUrl(file) {
  return '../tts/' + TTS_VOICE + '/' + file;
}

// 微信降级：预生成语音的文本→文件映射（只存文件名，路径由 TTS_VOICE 拼接）。
// 文本必须与 workout-data.js 实际播报文本逐字一致（由 tts/gen-*.js 生成）。
// 硬编码避免真机微信内 fetch manifest 失败导致映射为空（v44-v46 无声的根因）。
const TTS_MAP_ENTRIES = [
  ['开始训练。第一个动作，猫牛流动，8次循环。四点跪撑，双手在肩正下方、双膝在髋正下方。全程用鼻子拱背呼气，塌腰吸气，缓慢活动整条脊柱，幅度适中不猛甩。', 'ann-cat-cow-0-aef18a124ed7.mp3'],
  ['准备', 'token-0-ddcf6e77b0ee.mp3'],
  ['3', 'num-3-4e07408562be.mp3'],
  ['2', 'num-2-d4735e3a265e.mp3'],
  ['1', 'num-1-6b86b273ff34.mp3'],
  ['开始', 'token-4-d2bb025a2e51.mp3'],
  ['吸气', 'breathe-in-15b19641650f.mp3'],
  ['呼气', 'breathe-out-b2b64efb4d20.mp3'],
  ['猫牛流动完成。', 'done-cat-cow-03d5abcd79fc.mp3'],
  ['死虫式，第1组，共3组，每侧10次。全程仰卧，腰背完全贴紧地面，对侧手脚同步缓慢伸展收回，匀速不甩动。先左侧。', 'ann-dead-bug-1-3909596e27a0.mp3'],
  ['4', 'num-4-4b227777d4dd.mp3'],
  ['5', 'num-5-ef2d127de37b.mp3'],
  ['6', 'num-6-e7f6c011776e.mp3'],
  ['7', 'num-7-7902699be42c.mp3'],
  ['8', 'num-8-2c624232cdd2.mp3'],
  ['9', 'num-9-19581e27de7c.mp3'],
  ['10', 'num-10-4a44dc153642.mp3'],
  ['换另一侧。', 'trans-switch-side-f9a2e8b0f376.mp3'],
  ['第1组完成，休息30秒。', 'rest-1-30-fc68176359f9.mp3'],
  ['剩余10秒', 'remain-10-1d394feb2ed7.mp3'],
  ['第2组完成，休息30秒。', 'rest-2-30-6b8d3accffd7.mp3'],
  ['仰卧单膝抱胸，每侧保持30秒。双手轻抱单膝拉向胸口，对侧腿自然伸直贴地，温和牵拉下腰背，请勿暴力猛拉。先左侧。', 'ann-apanasana-0-10b4ab089b73.mp3'],
  ['仰卧单膝抱胸完成。', 'done-apanasana-3bd9e8d98ed9.mp3'],
  ['臀桥，第1组，共3组，12次。仰卧屈膝，脚跟踩地与肩同宽，收紧臀部向上顶髋至肩髋膝呈一条斜线，顶峰停留1秒，臀部发力，请勿用腰顶起。', 'ann-glute-bridge-1-3abfcb814355.mp3'],
  ['11', 'num-11-4fc82b26aecb.mp3'],
  ['12', 'num-12-6b51d431df5d.mp3'],
  ['婴儿式，保持30秒。跪姿，双膝分开，臀部缓慢坐向脚跟，上身前趴，额头贴垫，放松腰背、髋部及大腿前侧。', 'ann-balasana-0-bdaa5d896e2a.mp3'],
  ['婴儿式完成。', 'done-balasana-a112650abec4.mp3'],
  ['俯卧撑，第1组，共3组，10次。手略宽于肩，手肘斜向后45度，身体从头到脚保持一条直线，下放吸气2秒，推起呼气，杜绝塌腰撅屁股。', 'ann-pushup-1-f7e0383abcba.mp3'],
  ['狮身人面式，保持60秒。俯卧，手肘落在肩膀正下方，前臂贴地，骨盆贴紧垫子，胸口向前上方打开，不刻意挤压腰椎。', 'ann-sphinx-0-a8d78a7d2aa3.mp3'],
  ['训练结束。本次训练完成，辛苦了。', 'complete-end-43e373f7e81c.mp3'],
  ['开始训练。第一个动作，猫牛流动，8次循环。四点跪撑，双手在肩正下方、双膝在髋正下方。弓背吸气，塌腰呼气，缓慢活动整条脊柱，作为基础热身。', 'ann-cat-cow-0-40bf2d275c74.mp3'],
  ['靠墙天使，15次。后背、后脑勺、臀部贴墙，双脚离墙约10厘米。手臂弯曲90度贴墙，缓慢向上滑动再落下。全程保持下背贴墙，不要耸肩、不要挺腰。', 'ann-wall-angel-1-98210f794c9c.mp3'],
  ['13', 'num-13-3fdba35f04dc.mp3'],
  ['14', 'num-14-8527a891e224.mp3'],
  ['15', 'num-15-e629fa6598d7.mp3'],
  ['单杠离心下放，第1组，共3组，3次。跳上单杠，握距略宽于肩，核心收紧保持身体稳定。匀速缓慢下放身体，控制3到5秒落至最低点。全程不要塌腰晃荡、不要用腰腹摆动借力。', 'ann-eccentric-pullup-1-6a0f984e97ae.mp3'],
  ['第1组完成，休息45秒。', 'rest-1-45-2502f362980f.mp3'],
  ['第2组完成，休息45秒。', 'rest-2-45-25f96784a782.mp3'],
  ['门框胸肩拉伸。前臂贴门框，手肘与肩同高。向前迈一步，胸口向前打开，感受胸肩前侧牵拉。不要耸肩、不要过度挺腰。', 'ann-doorframe-stretch-0-9d04bae02b40.mp3'],
  ['休息15秒。', 'rest-x-15-82338424c733.mp3'],
  ['门框胸肩拉伸完成。', 'done-doorframe-stretch-baec783936bc.mp3'],
  ['自重深蹲，第1组，共3组，12次。双脚与肩同宽，脚尖微向外。臀部向后坐，膝盖与脚尖同向。腰背挺直，上半身轻微前倾为正常，请勿弯腰驼背塌腰。蹲至大腿接近平行地面即可。', 'ann-bodyweight-squat-1-8a027989e08e.mp3'],
  ['站立股四头肌拉伸，每侧保持30秒。单脚站立，同侧手抓脚踝，膝盖向后指向地面。骨盆保持中立，不要前倾、不要歪胯。感受大腿前侧牵拉，扶墙保持平衡。先左侧。', 'ann-standing-quad-stretch-0-ddab54a9f30d.mp3'],
  ['站立股四头肌拉伸完成。', 'done-standing-quad-stretch-2e03df89af10.mp3'],
  ['鸟狗式，第1组，共3组，10次每侧。四点支撑，腰背保持平直。对侧手脚同步缓慢伸展，至与背部齐平即可，不要抬太高。全程骨盆不歪斜、腰椎不塌陷，核心持续收紧。先左侧。', 'ann-bird-dog-1-4b7bef35954c.mp3'],
  ['婴儿式，保持40秒。双膝分开与髋同宽，臀部缓慢坐向脚跟。上身前趴，额头贴垫，手臂向前放松。彻底放松腰背、髋部，平缓呼吸收尾。', 'ann-balasana-0-f6d4cd255f31.mp3'],
];

// 稳定前缀兜底：训练参数（如 cycles）可被用户在设置页修改，导致播报文本
// 与精确 key 不一致而静默无声。动作名（猫牛流动）不可编辑，故用其前缀兜底。
const TTS_PREFIX_ENTRIES = [
  ['开始训练。第一个动作，猫牛流动', 'ann-cat-cow-0-40bf2d275c74.mp3']
];

// 临时调试：写入全局日志数组，由 tts-test 顶部面板展示（验证完删除）
function _dbg(msg) {
  var ts = new Date().toLocaleTimeString();
  var line = '[' + ts + '] ' + msg;
  try {
    window.__ttsLogs = window.__ttsLogs || [];
    window.__ttsLogs.push(line);
    if (window.__ttsSink) window.__ttsSink(line);
  } catch (_) {}
  console.log('[audio-dbg] ' + msg);
}

class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.voice = null;
    this.voicesLoaded = false;
    this.speechAvailable = false;
    this.beepAvailable = false;
    this.lastSpeechToken = 0;
    this._boundLoadVoices = this._loadVoices.bind(this);
    // 微信降级：预生成语音映射（text -> url），微信 WebView 不支持 Web Speech API
    this.ttsFiles = new Map(TTS_MAP_ENTRIES);
    this.currentTtsAudio = null; // 当前播放语音的 <audio> 元素（微信降级用）
    this.currentTtsSource = null; // 当前播放语音的 BufferSource（解码回退路径用）
    this.isWeChat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent);
    _dbg('构造 | isWeChat=' + this.isWeChat + ' ua=' + (typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 60) : 'n/a'));
  }

  /** 必须在用户手势（开始按钮）中调用：解锁 AudioContext、加载中文语音。 */
  init() {
    this._initAudioContext();
    if (!this.isWeChat) {
      this._initSpeech();
    }
    _dbg('init | isWeChat=' + this.isWeChat + ' speechAvail=' + this.speechAvailable + ' beepAvail=' + this.beepAvailable + ' mapSize=' + this.ttsFiles.size);
    return { speechAvailable: this.speechAvailable, beepAvailable: this.beepAvailable };
  }

  /** 用 <audio> 元素播放预生成语音文件（微信降级）。
   *  主路径 <audio>（真机已验证可用）；play() 被自动播放策略拒绝时，
   *  回退 AudioContext 解码播放（手势内已解锁的上下文不受非手势限制）。 */
  async _speakFromFile(text, opts, token, finish, urlOverride) {
    try {
      if (this.currentTtsAudio) {
        try { this.currentTtsAudio.pause(); } catch (_) {}
        try { this.currentTtsAudio.currentTime = 0; } catch (_) {}
        this.currentTtsAudio = null;
      }
      const url = urlOverride || this.ttsFiles.get(text);
      if (!url) {
        setTimeout(finish, this._estimateDurationMs(text));
        return;
      }
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      const vol = Math.min(1, Math.max(0, Number(opts.volume) || 1));
      audio.volume = vol;
      let settled = false;
      let knownDurMs = 0;
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          knownDurMs = audio.duration * 1000;
        }
      }, { once: true });
      const settle = (reason) => {
        if (settled) return;
        settled = true;
        _dbg('settle | reason=' + (reason || '?') + ' token=' + token + ' curToken=' + this.lastSpeechToken);
        try { audio.pause(); } catch (_) {}
        if (this.currentTtsAudio === audio) this.currentTtsAudio = null;
        if (token === this.lastSpeechToken) {
          this.duckUp();
          finish();
        }
      };
      audio.onended = () => settle('onended');
      audio.onerror = (e) => {
        _dbg('onerror | code=' + (audio.error ? audio.error.code : '?'));
        settle('onerror');
      };
      this.currentTtsAudio = audio;
      this.duckDown();
      try {
        await audio.play();
        _dbg('play-ok | url=' + url + ' vol=' + vol);
      } catch (playErr) {
        _dbg('play-reject | url=' + url + ' err=' + (playErr.message || playErr));
        console.warn('[audio] audio.play() 被拒，回退 AudioContext 解码播放', playErr);
        if (this.currentTtsAudio === audio) this.currentTtsAudio = null;
        this._playDecoded(url, opts, token, finish, text);
        return;
      }
      const estMs = this._estimateDurationMs(text);
      const safetyMs = Math.max(estMs, knownDurMs) + 1000;
      setTimeout(settle, safetyMs);
    } catch (err) {
      _dbg('file-err | err=' + (err.message || err));
      console.warn('[audio] 预生成语音播放失败', err);
      this.duckUp();
      setTimeout(finish, 300);
    }
  }

  /** 回退路径：AudioContext 解码播放 mp3（AudioContext 在开始手势内已解锁）。 */
  async _playDecoded(url, opts, token, finish, text) {
    try {
      const ac = this.audioCtx;
      if (!ac) throw new Error('AudioContext 不可用');
      if (ac.state === 'suspended') await ac.resume();
      const buf = await fetch(url).then((r) => r.arrayBuffer());
      const audioBuf = await new Promise((resolve, reject) => {
        try {
          ac.decodeAudioData(buf, resolve, () => reject(new Error('decodeAudioData 失败')));
        } catch (err) {
          reject(err);
        }
      });
      const src = ac.createBufferSource();
      src.buffer = audioBuf;
      const gain = ac.createGain();
      gain.gain.value = Math.min(1, Math.max(0, Number(opts.volume) || 1));
      src.connect(gain);
      gain.connect(ac.destination);
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (this.currentTtsSource === src) this.currentTtsSource = null;
        if (token === this.lastSpeechToken) {
          this.duckUp();
          finish();
        }
      };
      src.onended = settle;
      this.currentTtsSource = src;
      this.duckDown();
      src.start();
      _dbg('decoded-ok | url=' + url + ' dur=' + audioBuf.duration);
      const decodedDurMs = (Number.isFinite(audioBuf.duration) && audioBuf.duration > 0)
        ? audioBuf.duration * 1000
        : this._estimateDurationMs(text);
      setTimeout(settle, decodedDurMs + 1000);
    } catch (err) {
      _dbg('decoded-err | url=' + url + ' err=' + (err.message || err));
      console.warn('[audio] 解码播放失败', err);
      this.duckUp();
      setTimeout(finish, 300);
    }
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

  /** 解析文本对应的语音文件：先精确匹配，再稳定前缀兜底。 */
  _resolveTtsUrl(text) {
    const exact = this.ttsFiles.get(text);
    if (exact) return { url: _ttsUrl(exact), via: 'exact' };
    for (const [prefix, file] of TTS_PREFIX_ENTRIES) {
      if (text && text.startsWith(prefix)) return { url: _ttsUrl(file), via: 'prefix' };
    }
    return { url: null, via: null };
  }

  /** 朗读中文文本。onEnd 保证只触发一次（onend 或超时兜底）。 */
  speak(text, options = {}) {
    const opts = { rate: 1.0, volume: 1.0, onEnd: null, ...options };
    _dbg('speak入口 | isWeChat=' + this.isWeChat + ' speechAvail=' + this.speechAvailable + ' len=' + (text || '').length + ' head=' + (text || '').slice(0, 15));
    const token = ++this.lastSpeechToken;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof opts.onEnd === 'function') opts.onEnd();
    };

    // 微信分支：命中预生成语音则播文件，未命中静默推进（不报错不提示）
    if (this.isWeChat) {
      const r = this._resolveTtsUrl(text);
      _dbg('speak | weChat=1 map=' + this.ttsFiles.size + ' via=' + r.via + ' textLen=' + (text || '').length + ' text="' + (text || '').slice(0, 30) + '..."' + (r.url ? ' url=' + r.url : ''));
      if (r.url) {
        this._speakFromFile(text, opts, token, finish, r.url);
      } else {
        var keys = [];
        this.ttsFiles.forEach(function (v, k) { keys.push('"' + k.slice(0, 25) + '..."'); });
        _dbg('MISS | 已有keys: ' + JSON.stringify(keys));
        setTimeout(finish, this._estimateDurationMs(text || ''));
      }
      return token;
    }

    if (!this.speechAvailable || !text) {
      _dbg('skip | speechAvail=' + this.speechAvailable + ' text=' + !!text + ' (非微信原生TTS路径)');
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
    const text = String(word);

    // 微信分支：命中预生成语音则播文件，未命中静默
    if (this.isWeChat) {
      this.lastSpeechToken++;
      const r = this._resolveTtsUrl(text);
      if (r.url) {
        this._speakFromFile(text, opts, this.lastSpeechToken, () => {}, r.url);
      }
      return;
    }

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
    if (this.currentTtsAudio) {
      try { this.currentTtsAudio.pause(); } catch (_) {}
      try { this.currentTtsAudio.currentTime = 0; } catch (_) {}
      this.currentTtsAudio = null;
    }
    if (this.currentTtsSource) {
      try { this.currentTtsSource.stop(); } catch (_) {}
      this.currentTtsSource = null;
    }
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
