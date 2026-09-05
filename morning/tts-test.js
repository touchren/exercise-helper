/**
 * tts-test.js —— 临时微信语音诊断面板（验证完删除）
 *
 * 顶部定位原因：微信 WebView 里 position:fixed;bottom 的元素会被底部栏遮挡不可见，
 * 左上角（top:8px;left:8px）则已验证可见。故所有调试信息都渲染到本面板。
 *
 * 面板分四块：
 *   1) 环境诊断：UA、isWeChat、AudioManager/speechSynthesis/AudioContext 是否可用
 *   2) 映射诊断：ttsFiles 数量与 key 内容、训练首步实际文本、是否命中映射
 *   3) 播放测试：A-C 开场语速对比（+0%/+10%/+20%）+ D 蜂鸣/E 原生TTS 对照 + F 复现真实开始流程
 *   4) 实时日志：audio.js 的 _dbg 输出（window.__ttsSink 转发）
 *
 * 面板标题行右上角有折叠/展开按钮，调试期间可收起面板。
 */
(function () {
  'use strict';

  var TEXT = '测试语音。一二三。';
  var DIAG_VERSION = 'v59';
  var logLines = [];
  var ctx = null;

  // 仅在微信环境显示本调试面板：非微信走原生 speechSynthesis 正常工作，无需诊断
  var _isWeChatEnv = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent || '');
  if (!_isWeChatEnv) return;

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function playUrl(url) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var a = new Audio(url);
      a.preload = 'auto';
      a.volume = 1.0;
      a.onended = function () { if (settled) return; settled = true; resolve(); };
      a.onerror = function () {
        if (settled) return;
        settled = true;
        reject(new Error('audio error code=' + (a.error && a.error.code)));
      };
      a.play().catch(function (e) {
        if (settled) return;
        settled = true;
        reject(new Error('play() 被拒绝: ' + e.message));
      });
    });
  }

  function playBeep() {
    var ac = getCtx();
    var now = ac.currentTime;
    [0, 0.4, 0.8].forEach(function (off) {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + off);
      gain.gain.exponentialRampToValueAtTime(0.5, now + off + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.35);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + off);
      osc.stop(now + off + 0.4);
    });
    return new Promise(function (res) { setTimeout(res, 1400); });
  }

  function playSpeech() {
    return new Promise(function (resolve, reject) {
      if (!('speechSynthesis' in window)) {
        reject(new Error('无 speechSynthesis'));
        return;
      }
      var u = new SpeechSynthesisUtterance(TEXT);
      u.lang = 'zh-CN';
      u.rate = 1.0;
      u.onend = function () { resolve(); };
      u.onerror = function (e) {
        reject(new Error('utterance 错误: ' + (e.error || 'unknown')));
      };
      speechSynthesis.speak(u);
    });
  }

  // 复现真实「开始」流程：用当前设置构建首步 tts 并 speak，观察命中与播放结果
  function realStartTest() {
    return new Promise(function (resolve) {
      var am = new AudioManager();
      am.init();
      var settings = SettingsUI.currentSettings();
      var steps = buildStepSequence(settings.exercises, settings);
      var tts = steps[0].tts;
      am.speak(tts, { rate: settings.rate, volume: settings.volume, onEnd: resolve });
      setTimeout(resolve, 25000);
    });
  }

  function envSummary() {
    var ua = navigator.userAgent || '';
    var lines = [];
    lines.push('诊断版本: ' + DIAG_VERSION);
    lines.push('微信UA: ' + (/MicroMessenger/i.test(ua) ? '是' : '否'));
    lines.push('AudioManager: ' + (typeof AudioManager));
    lines.push('speechSynthesis: ' + ('speechSynthesis' in window ? '有' : '无'));
    lines.push('AudioContext: ' + (window.AudioContext || window.webkitAudioContext ? '有' : '无'));
    lines.push('UA: ' + ua);
    return lines.join('\n');
  }

  function mapSummary() {
    try {
      var am = new AudioManager();
      var settings = SettingsUI.currentSettings();
      var steps = buildStepSequence(settings.exercises, settings);
      var firstTts = steps[0].tts;
      var hit = am.ttsFiles.has(firstTts);
      var lines = [];
      lines.push('ttsFiles 数量: ' + am.ttsFiles.size);
      am.ttsFiles.forEach(function (url, k) { lines.push('key=' + k); });
      lines.push('');
      lines.push('首步实际文本=' + firstTts);
      lines.push('首步命中映射: ' + (hit ? '是 ✓' : '否 ✗（文本不一致，语音静默兜底）'));
      return lines.join('\n');
    } catch (e) {
      return 'mapSummary 异常: ' + e.message;
    }
  }

  function appendLog(line) {
    logLines.push(line);
    var el = document.getElementById('tts-diag-log');
    if (el) {
      el.textContent = logLines.join('\n');
      el.scrollTop = el.scrollHeight;
    }
  }

  function renderExistingLogs() {
    var existing = window.__ttsLogs || [];
    existing.forEach(appendLog);
    window.__ttsSink = appendLog;
  }

  var TESTS = [
  { id: 'tts-a', label: 'A 开场·语速+0%', fn: function () { return playUrl('../tts/xiaoxiao/open-rate0.mp3'); } },
  { id: 'tts-b', label: 'B 开场·语速+10%', fn: function () { return playUrl('../tts/xiaoxiao/open-rate10.mp3'); } },
  { id: 'tts-c', label: 'C 开场·语速+20%', fn: function () { return playUrl('../tts/xiaoxiao/open-rate20.mp3'); } },
    { id: 'tts-d', label: 'D 蜂鸣(对照)', fn: playBeep },
    { id: 'tts-e', label: 'E 原生TTS(对照)', fn: playSpeech },
    { id: 'tts-f', label: 'F 真实开始(复现)', fn: realStartTest }
  ];

  function buildSection(panel, titleText) {
    var t = document.createElement('div');
    t.textContent = titleText;
    t.style.cssText = 'font-weight:700;margin:6px 0 3px;color:#9db;';
    panel.appendChild(t);
    return t;
  }

  function build() {
    var panel = document.createElement('div');
    panel.id = 'tts-test-panel';
    panel.style.cssText = [
      'position:fixed;top:8px;left:8px;z-index:99999;',
      'background:rgba(18,18,28,0.96);border:1px solid #555;border-radius:10px;',
      'padding:10px 12px;color:#eee;font:12px/1.5 -apple-system,sans-serif;',
      'max-width:320px;max-height:92vh;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.5);'
    ].join('');

    var titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';

    var title = document.createElement('div');
    title.textContent = '🧪 语音诊断（临时 ' + DIAG_VERSION + '）';
    title.style.cssText = 'font-weight:700;';
    titleRow.appendChild(title);

    var foldBtn = document.createElement('button');
    foldBtn.type = 'button';
    foldBtn.id = 'tts-fold';
    foldBtn.textContent = '折叠';
    foldBtn.style.cssText = [
      'padding:2px 8px;border-radius:6px;border:1px solid #667;',
      'background:#23233a;color:#eee;font-size:11px;cursor:pointer;'
    ].join('');
    titleRow.appendChild(foldBtn);
    panel.appendChild(titleRow);

    var contentWrap = document.createElement('div');
    panel.appendChild(contentWrap);

    foldBtn.addEventListener('click', function () {
      var hidden = contentWrap.style.display === 'none';
      contentWrap.style.display = hidden ? '' : 'none';
      foldBtn.textContent = hidden ? '折叠' : '展开';
    });

    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.id = 'tts-refresh';
    refreshBtn.textContent = '🧹 强制刷新缓存（先点这个！）';
    refreshBtn.style.cssText = [
      'display:block;width:100%;padding:8px;margin:6px 0;border-radius:8px;',
      'border:1px solid #e74c3c;background:#7b241c;color:#fff;font-size:13px;',
      'font-weight:700;cursor:pointer;'
    ].join('');
    refreshBtn.addEventListener('click', function () {
      refreshBtn.textContent = '🧹 清理中…';
      refreshBtn.disabled = true;
      Promise.all([
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }),
        window.caches ? caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }) : Promise.resolve()
      ]).then(function () {
        location.reload();
      }).catch(function () {
        location.reload();
      });
    });
    contentWrap.appendChild(refreshBtn);

    buildSection(contentWrap, '— 环境诊断 —');
    var env = document.createElement('pre');
    env.textContent = envSummary();
    env.style.cssText = 'margin:0 0 4px;white-space:pre-wrap;font:11px/1.4 monospace;color:#eee;';
    contentWrap.appendChild(env);

    buildSection(contentWrap, '— 映射诊断 —');
    var map = document.createElement('pre');
    map.textContent = mapSummary();
    map.style.cssText = 'margin:0 0 4px;white-space:pre-wrap;font:11px/1.4 monospace;color:#eee;';
    contentWrap.appendChild(map);

    buildSection(contentWrap, '— 播放测试 —');
    TESTS.forEach(function (t) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0;';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = t.id;
      btn.textContent = t.label;
      btn.style.cssText = [
        'flex:1;padding:5px 8px;border-radius:6px;border:1px solid #667;',
        'background:#23233a;color:#eee;font-size:12px;cursor:pointer;text-align:left;'
      ].join('');

      var status = document.createElement('span');
      status.textContent = '·';
      status.style.cssText = 'font-size:11px;min-width:120px;color:#888;';
      status.id = t.id + '-status';

      row.appendChild(btn);
      row.appendChild(status);
      contentWrap.appendChild(row);

      btn.addEventListener('click', function () {
        var t0 = Date.now();
        setStatus(t.id, '播放中…', '#ffb347');
        t.fn().then(function () {
          setStatus(t.id, '✓ 完成 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's', '#4caf50');
        }).catch(function (err) {
          console.error('[tts-test]', t.label, err);
          setStatus(t.id, '✗ ' + err.message, '#f44336');
        });
      });
    });

    buildSection(contentWrap, '— 实时日志 —');
    var log = document.createElement('pre');
    log.id = 'tts-diag-log';
    log.style.cssText = 'margin:0;white-space:pre-wrap;font:11px/1.4 monospace;color:#0f0;background:#000;padding:6px;border-radius:6px;max-height:180px;overflow-y:auto;';
    contentWrap.appendChild(log);

    var hint = document.createElement('div');
    hint.textContent = '请截图整个面板发给我（含环境/映射/日志三块）';
    hint.style.cssText = 'color:#778;font-size:11px;margin-top:6px;';
    contentWrap.appendChild(hint);

    document.body.appendChild(panel);
    renderExistingLogs();
  }

  function setStatus(id, text, color) {
    var el = document.getElementById(id + '-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
  }

  if (document.body) {
    build();
  } else {
    document.addEventListener('DOMContentLoaded', build);
  }
})();
