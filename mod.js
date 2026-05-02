/**
 * ScratchMod JP — mod.js
 * scratch-vm を使いsb3の読込・実行・編集を行う。
 * 独自拡張：インターネット取得ブロック（時刻・天気・為替など）
 */

'use strict';

/* ── ユーティリティ ─────────────────────────── */
const $ = id => document.getElementById(id);
let vm = null;
let renderer = null;
let projectLoaded = false;
let running = false;
let currentSprite = null;

function con(msg, type = 'info') {
  const out = $('console-output');
  const line = document.createElement('div');
  line.className = `con-line con-${type}`;
  const now = new Date().toLocaleTimeString('ja-JP');
  line.textContent = `[${now}] ${msg}`;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function setStatus(msg) {
  $('status-text').textContent = msg;
}

/* ── scratch-vm 初期化 ──────────────────────── */
async function initVM() {
  // scratch-vm が存在する場合はそれを使う
  if (typeof ScratchVm !== 'undefined') {
    vm = new ScratchVm.VirtualMachine();
  } else if (typeof require !== 'undefined') {
    const VM = require('scratch-vm');
    vm = new VM();
  } else {
    con('scratch-vm が見つかりません。モックモードで動作します。', 'warn');
    initMockMode();
    return;
  }

  // Canvas レンダラー設定
  const canvas = $('scratch-stage');
  try {
    const { default: Renderer } = await import('https://cdn.jsdelivr.net/npm/scratch-render@0.1.0/src/index.js').catch(() => ({ default: null }));
    if (Renderer) {
      renderer = new Renderer(canvas);
      vm.attachRenderer(renderer);
    }
  } catch (e) {
    con('レンダラー読込失敗（軽量モード）', 'warn');
  }

  // VMイベント
  vm.on('PROJECT_RUN_START', () => {
    running = true;
    $('btn-stop').disabled = false;
    $('btn-run').disabled = true;
    setStatus('▶ 実行中...');
    con('プロジェクト開始', 'ok');
  });
  vm.on('PROJECT_RUN_STOP', () => {
    running = false;
    $('btn-run').disabled = false;
    $('btn-stop').disabled = true;
    setStatus('■ 停止');
    con('プロジェクト停止', 'info');
  });
  vm.on('SAY', (_, __, message) => {
    con(`💬 ${message}`, 'data');
  });

  // 独自拡張を登録
  registerInternetExtension();

  con('scratch-vm 初期化完了', 'ok');
  setStatus('準備完了 — sb3ファイルを開いてください');
}

/* ── モックモード（VMなし時のフォールバック） ── */
function initMockMode() {
  con('モックモード: sb3の解析と表示のみ対応', 'warn');
  setStatus('モックモード動作中');

  $('btn-run').addEventListener('click', () => {
    if (!projectLoaded) return;
    con('モックモード: 実行エミュレーション開始', 'ok');
    running = true;
    $('btn-run').disabled = true;
    $('btn-stop').disabled = false;
    setStatus('▶ 実行中（モック）');
  });
  $('btn-stop').addEventListener('click', () => {
    running = false;
    $('btn-run').disabled = false;
    $('btn-stop').disabled = true;
    setStatus('■ 停止（モック）');
    con('モックモード: 停止', 'info');
  });
}

/* ── 独自拡張：インターネット取得ブロック ────── */
function registerInternetExtension() {
  if (!vm) return;

  class InternetExtension {
    getInfo() {
      return {
        id: 'jpmod_internet',
        name: '🌐 ネット取得',
        color1: '#1565c0',
        color2: '#0d47a1',
        blocks: [
          {
            opcode: 'getCurrentTime',
            blockType: 'reporter',
            text: '現在の[FORMAT]を取得',
            arguments: {
              FORMAT: {
                type: 'field_dropdown',
                menu: 'timeFormats'
              }
            }
          },
          {
            opcode: 'getWeather',
            blockType: 'reporter',
            text: '[CITY]の[INFO]を取得',
            arguments: {
              CITY: { type: 'text', defaultValue: '大阪' },
              INFO: {
                type: 'field_dropdown',
                menu: 'weatherInfo'
              }
            }
          },
          {
            opcode: 'getExchangeRate',
            blockType: 'reporter',
            text: '[FROM]→[TO]の為替レート',
            arguments: {
              FROM: { type: 'text', defaultValue: 'USD' },
              TO:   { type: 'text', defaultValue: 'JPY' }
            }
          },
          {
            opcode: 'fetchURL',
            blockType: 'reporter',
            text: '[URL]をGETして取得',
            arguments: {
              URL: { type: 'text', defaultValue: 'https://api.example.com' }
            }
          },
          { blockType: 'label', text: '--- 高度な取得 ---' },
          {
            opcode: 'getJSONField',
            blockType: 'reporter',
            text: '[URL]のJSONから[KEY]を取得',
            arguments: {
              URL: { type: 'text', defaultValue: 'https://api.example.com/data.json' },
              KEY: { type: 'text', defaultValue: 'value' }
            }
          }
        ],
        menus: {
          timeFormats: {
            acceptReporters: false,
            items: ['時刻', '日付', '曜日', '年', '月', '日', '時', '分', '秒']
          },
          weatherInfo: {
            acceptReporters: false,
            items: ['天気', '気温', '湿度', '風速', '体感温度']
          }
        }
      };
    }

    getCurrentTime({ FORMAT }) {
      const now = new Date();
      const map = {
        '時刻':   now.toLocaleTimeString('ja-JP'),
        '日付':   now.toLocaleDateString('ja-JP'),
        '曜日':   ['日','月','火','水','木','金','土'][now.getDay()] + '曜日',
        '年':     now.getFullYear(),
        '月':     now.getMonth() + 1,
        '日':     now.getDate(),
        '時':     now.getHours(),
        '分':     now.getMinutes(),
        '秒':     now.getSeconds()
      };
      return map[FORMAT] ?? now.toString();
    }

    async getWeather({ CITY, INFO }) {
      try {
        // Open-Meteo（無料・APIキー不要）+ ジオコーディング
        const geo = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(CITY)}&count=1&language=ja`
        ).then(r => r.json());
        if (!geo.results?.length) return 'データなし';
        const { latitude: lat, longitude: lon } = geo.results[0];
        const wx = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m,apparent_temperature,windspeed_10m`
        ).then(r => r.json());
        const cw = wx.current_weather;
        const wmap = { 0:'晴れ', 1:'快晴', 2:'曇り', 3:'曇り', 45:'霧', 51:'小雨', 61:'雨', 71:'雪', 80:'雨', 95:'雷雨' };
        const weatherStr = wmap[cw.weathercode] ?? `コード${cw.weathercode}`;
        const map = {
          '天気':   weatherStr,
          '気温':   `${cw.temperature}°C`,
          '湿度':   `${wx.hourly?.relativehumidity_2m?.[0] ?? '--'}%`,
          '風速':   `${cw.windspeed}km/h`,
          '体感温度': `${wx.hourly?.apparent_temperature?.[0] ?? '--'}°C`
        };
        con(`天気取得: ${CITY} → ${map[INFO]}`, 'data');
        return map[INFO] ?? weatherStr;
      } catch (e) {
        con(`天気取得エラー: ${e.message}`, 'err');
        return 'エラー';
      }
    }

    async getExchangeRate({ FROM, TO }) {
      try {
        const data = await fetch(`https://open.er-api.com/v6/latest/${FROM.toUpperCase()}`).then(r => r.json());
        const rate = data.rates?.[TO.toUpperCase()];
        if (rate == null) return 'データなし';
        con(`為替: ${FROM}→${TO} = ${rate}`, 'data');
        return rate;
      } catch (e) {
        con(`為替取得エラー: ${e.message}`, 'err');
        return 'エラー';
      }
    }

    async fetchURL({ URL }) {
      try {
        const res = await fetch(URL);
        const text = await res.text();
        con(`GET ${URL} → ${text.length}文字`, 'data');
        return text.substring(0, 300);
      } catch (e) {
        con(`取得エラー: ${e.message}`, 'err');
        return 'エラー';
      }
    }

    async getJSONField({ URL, KEY }) {
      try {
        const data = await fetch(URL).then(r => r.json());
        // ドット記法でネストしたキーにアクセス: "a.b.c"
        const val = KEY.split('.').reduce((o, k) => o?.[k], data);
        con(`JSON取得: [${KEY}] = ${val}`, 'data');
        return val ?? 'キーなし';
      } catch (e) {
        con(`JSON取得エラー: ${e.message}`, 'err');
        return 'エラー';
      }
    }
  }

  vm.extensionManager.loadExtensionURL = function() {};
  // 組み込み登録
  if (vm.extensionManager._extensionRegistry) {
    vm.extensionManager._extensionRegistry.set('jpmod_internet', InternetExtension);
  }
  // scratch-vm 3.x の拡張登録方法
  try {
    vm.extensionManager.addBuiltinExtensionObject('jpmod_internet', new InternetExtension());
    con('🌐 インターネット取得拡張 登録完了', 'ok');
  } catch (e) {
    // 別の登録方式を試みる
    try {
      if (vm._extensions) vm._extensions.set('jpmod_internet', new InternetExtension());
      con('🌐 インターネット取得拡張 登録完了（代替方式）', 'ok');
    } catch (e2) {
      con('拡張登録はプロジェクト読込後に有効になります', 'warn');
    }
  }
}

/* ── sb3 読み込み ────────────────────────────── */
async function loadSB3(file) {
  setStatus('読み込み中...');
  con(`sb3読み込み開始: ${file.name}`, 'info');
  $('project-name').textContent = file.name.replace('.sb3','');

  const buf = await file.arrayBuffer();

  if (vm) {
    try {
      await vm.loadProject(buf);
      projectLoaded = true;
      $('btn-run').disabled = false;
      $('btn-save').disabled = false;
      $('stage-overlay').classList.remove('visible');
      setStatus(`✔ 読込完了: ${file.name}`);
      con(`✔ プロジェクト読込完了: ${file.name}`, 'ok');
      renderSpriteList();
    } catch (e) {
      con(`VM読込エラー: ${e.message}`, 'err');
      // フォールバック：JSONパース表示
      loadSB3Fallback(buf, file.name);
    }
  } else {
    loadSB3Fallback(buf, file.name);
  }
}

async function loadSB3Fallback(buf, filename) {
  try {
    const JSZip = window.JSZip ?? await loadJSZip();
    const zip = await JSZip.loadAsync(buf);
    const projectJson = JSON.parse(await zip.file('project.json').async('string'));

    projectLoaded = true;
    $('btn-run').disabled = false;
    $('btn-save').disabled = false;
    $('stage-overlay').classList.remove('visible');

    renderSpritesFromJSON(projectJson, zip);
    setStatus(`✔ 読込完了（解析モード）: ${filename}`);
    con(`✔ sb3解析完了: スプライト ${projectJson.targets?.length ?? 0}個`, 'ok');

    // ブロック情報をコンソールに表示
    projectJson.targets?.forEach(t => {
      const count = Object.keys(t.blocks ?? {}).length;
      con(`  • ${t.name}: ブロック ${count}個`, 'data');
    });

    // ブロックエディタにJSON表示
    renderBlockEditor(projectJson);

    window._projectJSON = projectJson;
    window._projectZip = zip;
  } catch (e) {
    con(`sb3解析エラー: ${e.message}`, 'err');
    setStatus('読込失敗');
  }
}

async function loadJSZip() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ── スプライト一覧表示（VM版） ─────────────── */
function renderSpriteList() {
  if (!vm) return;
  const list = $('sprite-list');
  list.innerHTML = '';
  const targets = vm.runtime.targets;
  targets.forEach(t => {
    const item = document.createElement('div');
    item.className = 'sprite-item' + (t.isStage ? '' : '');
    if (t.isStage) return; // ステージは別表示

    const thumb = document.createElement('div');
    thumb.className = 'sprite-thumb-placeholder';
    thumb.textContent = '🎭';

    const name = document.createElement('div');
    name.className = 'sprite-name';
    name.textContent = t.sprite?.name ?? 'スプライト';

    item.appendChild(thumb);
    item.appendChild(name);
    item.addEventListener('click', () => {
      document.querySelectorAll('.sprite-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      currentSprite = t;
      con(`スプライト選択: ${name.textContent}`, 'info');
    });
    list.appendChild(item);
  });
}

/* ── スプライト一覧（JSONフォールバック版） ──── */
async function renderSpritesFromJSON(json, zip) {
  const list = $('sprite-list');
  const bgList = $('backdrop-list');
  list.innerHTML = '';
  bgList.innerHTML = '';

  for (const target of (json.targets ?? [])) {
    const item = document.createElement('div');
    item.className = 'sprite-item';

    const thumb = document.createElement('div');
    thumb.className = 'sprite-thumb-placeholder';

    // コスチュームサムネイル取得試み
    const costume = target.costumes?.[target.currentCostume ?? 0];
    if (costume?.md5ext && zip) {
      try {
        const blob = await zip.file(costume.md5ext)?.async('blob');
        if (blob) {
          const url = URL.createObjectURL(blob);
          const img = document.createElement('img');
          img.className = 'sprite-thumb';
          img.src = url;
          thumb.replaceWith(img);
        }
      } catch (_) {}
    }

    if (thumb.isConnected) {
      thumb.textContent = target.isStage ? '🖼' : '🎭';
    }

    const name = document.createElement('div');
    name.className = 'sprite-name';
    name.textContent = target.name;

    item.appendChild(thumb.isConnected ? thumb : thumb);
    item.appendChild(name);
    item.addEventListener('click', () => {
      document.querySelectorAll('.sprite-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      currentSprite = target;
      renderBlockEditor(json, target);
    });

    if (target.isStage) bgList.appendChild(item);
    else list.appendChild(item);
  }
}

/* ── ブロックエディタ表示（JSON解析モード） ──── */
function renderBlockEditor(json, selectedTarget) {
  const target = selectedTarget ?? json.targets?.find(t => !t.isStage) ?? json.targets?.[0];
  if (!target) return;

  const div = $('blockly-div');

  // Blocklyが存在する場合
  if (window.Blockly) {
    renderBlocklyWorkspace(target);
    return;
  }

  // フォールバック：ブロックをHTML表示
  div.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:16px; overflow-y:auto; height:100%; font-family:monospace;';

  const title = document.createElement('div');
  title.style.cssText = 'color:#7c5bfa; font-size:14px; font-weight:700; margin-bottom:12px;';
  title.textContent = `📦 ${target.name} のブロック`;
  wrapper.appendChild(title);

  const blocks = target.blocks ?? {};
  const topBlocks = Object.entries(blocks).filter(([, b]) => b.topLevel);

  if (topBlocks.length === 0) {
    const empty = document.createElement('p');
    empty.style.color = '#6b7599';
    empty.textContent = 'ブロックなし';
    wrapper.appendChild(empty);
  } else {
    topBlocks.forEach(([id, block]) => {
      const script = buildBlockTree(blocks, id, 0);
      wrapper.appendChild(script);
    });
  }

  // 変数表示
  if (Object.keys(target.variables ?? {}).length) {
    const varTitle = document.createElement('div');
    varTitle.style.cssText = 'color:#2ec27e; font-size:13px; font-weight:700; margin-top:20px; margin-bottom:8px;';
    varTitle.textContent = '📊 変数一覧';
    wrapper.appendChild(varTitle);
    Object.entries(target.variables).forEach(([, [name, val]]) => {
      const v = document.createElement('div');
      v.style.cssText = 'color:#b09cf5; font-size:12px; padding:2px 8px;';
      v.textContent = `${name} = ${JSON.stringify(val)}`;
      wrapper.appendChild(v);
    });
  }

  div.appendChild(wrapper);
}

/* ── ブロックツリー再帰描画 ─────────────────── */
function buildBlockTree(blocks, id, depth) {
  const block = blocks[id];
  if (!block) return document.createTextNode('');

  const container = document.createElement('div');
  container.style.cssText = `margin-left:${depth * 18}px; margin-bottom:2px;`;

  const row = document.createElement('div');
  row.style.cssText = getBlockStyle(block.opcode);
  row.textContent = formatOpcode(block.opcode, block.fields, block.inputs);
  container.appendChild(row);

  // サブスタック（ループ・条件の中身）
  if (block.inputs?.SUBSTACK?.block) {
    const sub = buildBlockTree(blocks, block.inputs.SUBSTACK.block, depth + 1);
    container.appendChild(sub);
  }
  if (block.inputs?.SUBSTACK2?.block) {
    const sub2 = buildBlockTree(blocks, block.inputs.SUBSTACK2.block, depth + 1);
    container.appendChild(sub2);
  }

  // 次のブロック
  if (block.next) {
    const next = buildBlockTree(blocks, block.next, depth);
    container.after(next); // 同レベルに追加
    container.parentNode?.appendChild(next);
  }

  return container;
}

function getBlockStyle(opcode) {
  const base = 'padding:3px 10px; border-radius:5px; font-size:11px; margin-bottom:1px; display:inline-block; ';
  if (!opcode) return base + 'color:#555;';
  if (opcode.startsWith('event_'))   return base + 'background:#c2771a22; color:#f5a742; border-left:3px solid #f5a742;';
  if (opcode.startsWith('motion_'))  return base + 'background:#4c1aff22; color:#9d7aff; border-left:3px solid #7c5bfa;';
  if (opcode.startsWith('looks_'))   return base + 'background:#6a1ab822; color:#c47df5; border-left:3px solid #9b59b6;';
  if (opcode.startsWith('sound_'))   return base + 'background:#1ab87022; color:#4af5a0; border-left:3px solid #2ec27e;';
  if (opcode.startsWith('control_')) return base + 'background:#b87a1a22; color:#f5c842; border-left:3px solid #f5c842;';
  if (opcode.startsWith('sensing_')) return base + 'background:#1a7ab822; color:#42b8f5; border-left:3px solid #4f8ef7;';
  if (opcode.startsWith('operator_'))return base + 'background:#1a8b1a22; color:#6af542; border-left:3px solid #4caf50;';
  if (opcode.startsWith('data_'))    return base + 'background:#b81a1a22; color:#f57c7c; border-left:3px solid #e05c5c;';
  if (opcode.startsWith('jpmod_'))   return base + 'background:#1a4cb822; color:#7cc4f5; border-left:3px solid #1565c0;';
  return base + 'background:#1e223344; color:#d4daf5; border-left:3px solid #2a2f45;';
}

function formatOpcode(opcode, fields, inputs) {
  if (!opcode) return '(不明)';
  const readable = {
    'event_whenflagclicked':    '🚩 フラグがクリックされたとき',
    'event_whenkeypressed':     '⌨ キーが押されたとき',
    'motion_movesteps':         '→ 歩動かす',
    'motion_turnright':         '↻ 度回す',
    'motion_turnleft':          '↺ 度回す',
    'motion_gotoxy':            '⊕ x,y に移動',
    'motion_glideto':           '⟿ 秒でglide',
    'looks_say':                '💬 と言う',
    'looks_sayforsecs':         '💬 秒間言う',
    'looks_nextcostume':        '👗 次のコスチューム',
    'sound_play':               '🔊 音を鳴らす',
    'control_wait':             '⏱ 秒待つ',
    'control_repeat':           '🔁 回繰り返す',
    'control_forever':          '♾ ずっと',
    'control_if':               '❓ もし',
    'control_if_else':          '❓ もし〜でなければ',
    'control_stop':             '⏹ 止める',
    'data_setvariableto':       '📊 変数を〜にする',
    'data_changevariableby':    '📊 変数を〜ずつ変える',
    'operator_add':             '➕ 足す',
    'operator_subtract':        '➖ 引く',
    'operator_multiply':        '✖ 掛ける',
    'operator_divide':          '➗ 割る',
    'sensing_askandwait':       '❓ 聞いて待つ',
    'jpmod_internet_getCurrentTime': '🌐 現在時刻を取得',
    'jpmod_internet_getWeather':     '🌐 天気を取得',
    'jpmod_internet_getExchangeRate':'🌐 為替レートを取得',
  };
  const label = readable[opcode] ?? opcode.replace(/_/g, ' ');
  // フィールド値を追加
  const fieldVals = Object.entries(fields ?? {}).map(([k, v]) => `${v?.[0] ?? ''}`).filter(Boolean).join(', ');
  return fieldVals ? `${label}  [${fieldVals}]` : label;
}

/* ── Blocklyワークスペース（Blocklyが読み込まれた場合） */
function renderBlocklyWorkspace(target) {
  const div = $('blockly-div');
  if (div._blocklyWorkspace) {
    div._blocklyWorkspace.dispose();
  }
  try {
    const ws = Blockly.inject(div, {
      toolbox: buildToolbox(),
      theme: Blockly.Themes.Dark ?? Blockly.Theme.defineTheme('dark', {
        base: Blockly.Themes.Classic,
        componentStyles: { workspaceBackgroundColour: '#0f1117' }
      }),
      grid: { spacing: 20, length: 3, colour: '#1e2233', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      trashcan: true
    });
    div._blocklyWorkspace = ws;
  } catch (e) {
    con('Blocklyワークスペース初期化エラー: ' + e.message, 'err');
  }
}

function buildToolbox() {
  return {
    kind: 'categoryToolbox',
    contents: [
      { kind: 'category', name: '動き',     colour: '#4C97FF', contents: [] },
      { kind: 'category', name: '見た目',   colour: '#9966FF', contents: [] },
      { kind: 'category', name: '音',       colour: '#CF63CF', contents: [] },
      { kind: 'category', name: 'イベント', colour: '#FFAB19', contents: [] },
      { kind: 'category', name: '制御',     colour: '#FFAB19', contents: [] },
      { kind: 'category', name: '調べる',   colour: '#5CB1D6', contents: [] },
      { kind: 'category', name: '演算',     colour: '#59C059', contents: [] },
      { kind: 'category', name: '変数',     colour: '#FF8C1A', contents: [] },
      { kind: 'sep' },
      { kind: 'category', name: '🌐 ネット取得', colour: '#1565c0', contents: [] },
    ]
  };
}

/* ── sb3 保存 ────────────────────────────────── */
async function saveSB3() {
  if (!projectLoaded) return;
  con('sb3保存中...', 'info');
  try {
    if (vm) {
      const buf = await vm.saveProjectSb3();
      downloadBlob(buf, `${$('project-name').textContent}_mod.sb3`);
      con('✔ 保存完了', 'ok');
    } else if (window._projectZip) {
      // JSONを更新してzip再パック
      const json = window._projectJSON;
      window._projectZip.file('project.json', JSON.stringify(json));
      const blob = await window._projectZip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${$('project-name').textContent}_mod.sb3`);
      con('✔ 保存完了（解析モード）', 'ok');
    }
  } catch (e) {
    con(`保存エラー: ${e.message}`, 'err');
  }
}

function downloadBlob(data, filename) {
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── イベントリスナー ────────────────────────── */
$('file-input').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (file) loadSB3(file);
  e.target.value = ''; // 同一ファイルの再読込を許可
});

$('btn-load').addEventListener('click', () => $('file-input').click());

$('btn-run').addEventListener('click', () => {
  if (!projectLoaded || !vm) return;
  vm.start();
  vm.greenFlag();
});

$('btn-stop').addEventListener('click', () => {
  if (!vm) return;
  vm.stopAll();
});

$('btn-save').addEventListener('click', saveSB3);

$('btn-clear-console').addEventListener('click', () => {
  $('console-output').innerHTML = '';
  con('コンソールをクリアしました', 'info');
});

// モード切替
$('mode-edit').addEventListener('click', () => {
  $('mode-edit').classList.add('active');
  $('mode-run').classList.remove('active');
  $('editor-area').style.display = '';
  setStatus(projectLoaded ? '編集モード' : '編集モード — sb3を開いてください');
  con('編集モードに切替', 'info');
});

$('mode-run').addEventListener('click', () => {
  $('mode-run').classList.add('active');
  $('mode-edit').classList.remove('active');
  $('editor-area').style.display = 'none';
  setStatus(projectLoaded ? '実行モード' : '実行モード — sb3を開いてください');
  con('実行モードに切替', 'info');
});

// ドラッグ＆ドロップ
document.body.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
document.body.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  if (file?.name.endsWith('.sb3')) loadSB3(file);
  else con('sb3ファイルをドロップしてください', 'warn');
});

/* ── 起動 ────────────────────────────────────── */
con('ScratchMod JP 起動中...', 'info');
initVM().catch(e => {
  con(`初期化エラー: ${e.message}`, 'err');
  initMockMode();
});
