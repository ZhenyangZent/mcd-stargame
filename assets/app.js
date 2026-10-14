/**
 * 星級遊戲 QR 收集冊。
 *
 * 兌換狀態模型：
 *   實際狀態 = 使用者手動設定（localStorage 的 overrides）?? 資料裡的預設（codes.json 的 redeemed 欄位）
 * 初始 118 筆標為 redeemed:true；之後新增的項目沒有此欄位，預設為「未兌換」。
 * 使用者手動改過的狀態永遠保留，不會被資料更新蓋掉。
 */
const LIFF_ID = '2010522144-5nZYW3pn';
const STORAGE_KEY = 'mcd-stargame-2026:overrides';
const PAGE_SIZE = 50;
const TABS = ['codes', 'scan', 'places'];
const ID_RE = /^[0-9a-f]{12}$/;

const $ = (id) => document.getElementById(id);
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

const state = {
  codes: [],
  places: null,
  overrides: load(),
  codeFilter: { query: '', status: 'all' },
  placeFilter: { query: '', cat: '', city: '' },
  placeLimit: PAGE_SIZE,
  scannedId: null,
};

// ---- 狀態 ----

function load() {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function save() {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(state.overrides)); } catch { /* 無痕模式等情況 */ }
}
const defaultOf = (id) => state.codes.find((c) => c.id === id)?.redeemed === true;
const isRedeemed = (id) => state.overrides[id] ?? defaultOf(id);

function setRedeemed(id, value) {
  // 與預設相同就不用記，保持 overrides 精簡
  if (value === defaultOf(id)) delete state.overrides[id];
  else state.overrides[id] = value;
  save();
  renderStats();
}

// ---- 小工具 ----

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked') node.checked = !!v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}
const fetchJson = (path) => fetch(path, { cache: 'no-cache' }).then((r) => {
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return r.json();
});
const label = (entry) => entry.id.slice(-8);
const canonicalUrl = (id) => `https://liff.line.me/${LIFF_ID}?q=${id}`;

function parseStarUrl(input) {
  try {
    const u = new URL(String(input ?? '').trim());
    if (u.protocol !== 'https:' || u.hostname !== 'liff.line.me') return null;
    if (u.pathname.replace(/\/$/, '') !== `/${LIFF_ID}`) return null;
    const id = (u.searchParams.get('q') ?? '').toLowerCase();
    return ID_RE.test(id) ? id : null;
  } catch { return null; }
}

// ---- QR 圖形 ----

const pathCache = new Map();
function qrSvg(text, ariaLabel) {
  let hit = pathCache.get(text);
  if (!hit) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    hit = { extent: n + 8, d };
    pathCache.set(text, hit);
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${hit.extent} ${hit.extent}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', ariaLabel);
  svg.setAttribute('class', 'qr');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', hit.d);
  svg.append(path);
  return svg;
}

// 進入畫面附近才產生 QR
const qrObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        mountQr(e.target);
        qrObserver.unobserve(e.target);
      }
    }, { rootMargin: '400px 0px' })
  : null;
function mountQr(slot) {
  if (!slot.firstChild) slot.append(qrSvg(slot.dataset.text, slot.getAttribute('aria-label')));
}

// ---- QR Code 分頁 ----

function filterCodes() {
  const { query, status } = state.codeFilter;
  const q = query.trim().toLowerCase();
  return state.codes
    .filter((c) => {
      const done = isRedeemed(c.id);
      if (status === 'todo' && done) return false;
      if (status === 'done' && !done) return false;
      return !q || c.id.includes(q);
    })
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)) || a.id.localeCompare(b.id));
}

function buildCard(entry) {
  const done = isRedeemed(entry.id);
  const slot = el('button', {
    type: 'button', class: 'qr-slot', 'data-text': entry.url,
    'aria-label': `放大 ${label(entry)} 的 QR Code`, onClick: () => openQrDialog(entry),
  });
  qrObserver ? qrObserver.observe(slot) : mountQr(slot);
  return el('article', { class: `code-card${done ? ' is-redeemed' : ''}`, 'data-id': entry.id }, [
    slot,
    el('div', { class: 'code-title' }, [el('strong', { class: 'code', text: label(entry) })]),
    el('div', { class: 'code-actions' }, [
      el('label', { class: 'check-label' }, [
        el('input', { type: 'checkbox', checked: done, onChange: (e) => onToggle(entry, e.target.checked) }),
        el('span', { text: '已兌換' }),
      ]),
      el('a', { class: 'btn', href: entry.url, target: '_blank', rel: 'noopener', text: '開啟網址' }),
    ]),
  ]);
}

function onToggle(entry, value) {
  setRedeemed(entry.id, value);
  const old = $('code-grid').querySelector(`[data-id="${entry.id}"]`);
  const stillVisible = state.codeFilter.status === 'all' || (state.codeFilter.status === 'done') === value;
  if (old && stillVisible) old.replaceWith(buildCard(entry));
  else renderCodes();
  if (state.scannedId === entry.id) renderScanResult();
}

function renderCodes() {
  const list = filterCodes();
  $('code-grid').replaceChildren(...(list.length
    ? list.map(buildCard)
    : [el('p', { class: 'empty', text: state.codes.length ? '沒有符合的 QR Code。' : '還沒有 QR Code。' })]));
}

function renderStats() {
  $('stat-redeemed').textContent = String(state.codes.filter((c) => isRedeemed(c.id)).length);
  $('stat-codes').textContent = String(state.codes.length);
}

function openQrDialog(entry) {
  $('qr-dialog-title').textContent = label(entry);
  $('qr-dialog-body').replaceChildren(qrSvg(entry.url, `${label(entry)} 的 QR Code`));
  $('qr-dialog-link').href = entry.url;
  $('qr-dialog').showModal();
}

function bindCodeControls() {
  $('code-query').addEventListener('input', (e) => { state.codeFilter.query = e.target.value; renderCodes(); });
  const radios = document.querySelectorAll('[data-status]');
  radios.forEach((b) => b.addEventListener('click', () => {
    state.codeFilter.status = b.dataset.status;
    radios.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    renderCodes();
  }));
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
}

// ---- 匯入匯出：只存「與預設不同」的項目 ----

function exportText() {
  return JSON.stringify(state.overrides);
}
function bindBackup() {
  $('backup-open').addEventListener('click', () => {
    $('backup-export').value = exportText();
    $('backup-result').textContent = '';
    $('backup-dialog').showModal();
  });
  $('backup-copy').addEventListener('click', async () => {
    const b = $('backup-copy');
    try { await navigator.clipboard.writeText($('backup-export').value); b.textContent = '已複製'; }
    catch { $('backup-export').select(); b.textContent = '複製失敗'; }
    setTimeout(() => { b.textContent = '複製'; }, 1500);
  });
  $('backup-import-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const data = JSON.parse($('backup-import').value);
      let n = 0;
      for (const [id, v] of Object.entries(data)) {
        if (ID_RE.test(id) && typeof v === 'boolean') { state.overrides[id] = v; n++; }
      }
      save(); renderStats(); renderCodes();
      $('backup-result').textContent = `匯入 ${n} 筆`;
      $('backup-import').value = '';
    } catch { $('backup-result').textContent = '格式不正確'; }
  });
}

// ---- 點位 ----

let placesLoading = null;
function ensurePlaces() {
  placesLoading ??= fetchJson('data/places.json').then((raw) => {
    state.places = {
      categories: raw.categories,
      cities: raw.cities,
      list: raw.places.map(([id, cat, name, city, points, address, query, note]) => ({
        id, cat, name, city: raw.cities[city] ?? '', address, query: query || address, note: note || '',
      })),
    };
    state.places.categories.forEach((n, i) => $('place-cat').append(new Option(n, String(i))));
    const used = new Set(state.places.list.map((p) => p.city));
    state.places.cities.filter((c) => used.has(c)).forEach((c) => $('place-city').append(new Option(c, c)));
    renderPlaces();
  }).catch((err) => {
    console.error(err);
    placesLoading = null;
    $('place-rows').replaceChildren(el('tr', {}, [el('td', { class: 'empty', colspan: '2', text: '點位載入失敗。' })]));
  });
}

function renderPlaces() {
  if (!state.places) return;
  const { query, cat, city } = state.placeFilter;
  const q = query.trim().toLowerCase();
  const list = state.places.list.filter((p) =>
    (cat === '' || p.cat === Number(cat)) &&
    (city === '' || p.city === city) &&
    (!q || [p.name, p.address, p.note].some((f) => f.toLowerCase().includes(q))));
  $('place-count').textContent = `${list.length} 個點位`;
  const rows = list.slice(0, state.placeLimit).map((p) => el('tr', {}, [
    el('td', {}, [el('span', { text: p.name }), p.note ? el('small', { text: p.note }) : null]),
    el('td', { class: 'address' }, [el('a', {
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.query)}`,
      target: '_blank', rel: 'noopener', text: p.address,
    })]),
  ]));
  $('place-rows').replaceChildren(...(rows.length
    ? rows : [el('tr', {}, [el('td', { class: 'empty', colspan: '2', text: '沒有符合的點位。' })])]));
  $('place-more').hidden = list.length <= state.placeLimit;
}

function bindPlaceControls() {
  let timer = 0;
  const update = (key, debounce) => (e) => {
    state.placeFilter[key] = e.target.value;
    state.placeLimit = PAGE_SIZE;
    clearTimeout(timer);
    debounce ? (timer = setTimeout(renderPlaces, 120)) : renderPlaces();
  };
  $('place-query').addEventListener('input', update('query', true));
  $('place-cat').addEventListener('change', update('cat', false));
  $('place-city').addEventListener('change', update('city', false));
  $('place-more').addEventListener('click', () => { state.placeLimit += PAGE_SIZE; renderPlaces(); });
}

// ---- 掃描 ----

function showScanError(msg) {
  $('scan-error').textContent = msg ?? '';
  $('scan-error').hidden = !msg;
}

function handleScannedText(text) {
  const id = parseStarUrl(text);
  state.scannedId = id;
  if (!id) {
    $('scan-result').replaceChildren();
    showScanError(text.trim() ? '不是星級遊戲的 QR Code' : null);
    return;
  }
  showScanError(null);
  renderScanResult();
}

function renderScanResult() {
  const id = state.scannedId;
  if (!id) return;
  const known = state.codes.find((c) => c.id === id);
  const done = known && isRedeemed(id);
  $('scan-result').replaceChildren(el('div', { class: 'scan-result' }, [
    el('div', { class: 'scan-head' }, [
      el('strong', { class: 'scan-code', text: id.slice(-8) }),
      el('span', { class: 'muted', text: known ? '已收錄' : '未收錄' }),
    ]),
    done ? el('p', { class: 'notice', text: '已兌換' }) : null,
    known
      ? el('label', { class: 'check-label' }, [
          el('input', { type: 'checkbox', checked: done, onChange: (e) => onToggle(known, e.target.checked) }),
          el('span', { text: '已兌換' }),
        ])
      : el('p', { class: 'muted', text: '這個 QR Code 還沒收錄，把它傳給維護者加入 data/codes.json。' }),
  ]));
}

// 優先用瀏覽器內建 BarcodeDetector，沒有就用 jsQR
const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
async function decodeSource(source, width, height) {
  if (detector) {
    const found = await detector.detect(source);
    return found[0]?.rawValue ?? null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  return jsQR(ctx.getImageData(0, 0, width, height).data, width, height)?.data ?? null;
}

let cameraStream = null;
let scanTimer = 0;
async function openCamera() {
  const video = $('camera-video');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch { closeCamera(); showScanError('無法開啟相機'); return; }
  video.srcObject = cameraStream;
  $('camera-dialog').showModal();
  await video.play();
  const tick = async () => {
    if (!cameraStream) return;
    try {
      if (video.videoWidth) {
        const text = await decodeSource(video, video.videoWidth, video.videoHeight);
        if (text) { closeCamera(); $('scan-url').value = text; handleScannedText(text); return; }
      }
    } catch (err) { console.warn(err); }
    scanTimer = setTimeout(tick, 200);
  };
  tick();
}
function closeCamera() {
  clearTimeout(scanTimer);
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  $('camera-video').srcObject = null;
  if ($('camera-dialog').open) $('camera-dialog').close();
}

function bindScan() {
  $('scan-url').addEventListener('input', (e) => handleScannedText(e.target.value));
  $('camera-dialog').addEventListener('close', closeCamera);
  if (navigator.mediaDevices?.getUserMedia) {
    $('scan-camera').hidden = false;
    $('scan-camera').addEventListener('click', openCamera);
  }
  $('scan-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const text = await decodeSource(bmp, bmp.width, bmp.height);
      bmp.close();
      if (!text) { showScanError('照片裡找不到 QR Code'); return; }
      $('scan-url').value = text;
      handleScannedText(text);
    } catch (err) { console.error(err); showScanError('照片讀取失敗'); }
  });
}

// ---- 分頁 ----

function showTab(name) {
  const tab = TABS.includes(name) ? name : 'codes';
  for (const t of TABS) {
    $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
    $(`panel-${t}`).hidden = t !== tab;
  }
  if (tab === 'places') ensurePlaces();
}
function bindTabs() {
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    history.replaceState(null, '', `#${b.dataset.tab}`);
    showTab(b.dataset.tab);
  }));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));
}

async function main() {
  bindCodeControls(); bindBackup(); bindPlaceControls(); bindScan(); bindTabs();
  fetchJson('data/summary.json').then((s) => { $('stat-points').textContent = String(s.pointCount); }).catch(() => {});
  try {
    state.codes = await fetchJson('data/codes.json');
  } catch (err) {
    console.error(err);
    $('code-grid').replaceChildren(el('p', { class: 'empty', text: '清單載入失敗（請用 start.bat 開啟，不要直接雙擊 index.html）。' }));
    return;
  }
  renderCodes(); renderStats(); renderScanResult();
}
main();
