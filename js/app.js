/* app.js - 娃衣柜主逻辑 */
'use strict';

/* ================= 常量 ================= */
const CATEGORIES = ['全套', '连衣裙', '上衣', '下装', '外套', '鞋袜', '假发', '眼珠', '配饰', '其他'];
const STATUSES = [
  {v: 'in_transit', t: '在途（未发货）'},
  {v: 'received', t: '已到货'},
  {v: 'wearing', t: '穿着中'},
  {v: 'selling', t: '出闲置中'},
  {v: 'sold', t: '已出'}
];
const PAY_TYPES = ['定金', '尾款', '补款', '全款', '邮费', '其他'];
const REM_KINDS = ['补款', '发货', '抢购/上新', '其他'];
const COMMON_SIZES = ['三分', '四分', '六分', '八分', 'OB11', '其他'];
const DOLL_ALL = ''; // item.dollId === '' 表示通用/未指定

/* ================= 全局状态 ================= */
let data = loadData();
let currentPage = 'home';
let state = {query: '', dollFilter: '', statusFilter: '', catFilter: ''};

const pageEl = () => document.getElementById('pageContainer');

/* ================= 查询辅助 ================= */
const dollById = id => data.dolls.find(d => d.id === id);
const itemById = id => data.items.find(i => i.id === id);
const itemsByDoll = dollId => data.items.filter(i => i.dollId === dollId || i.dollId === DOLL_ALL);
function paymentsByItem(itemId){ return data.payments.filter(p => p.itemId === itemId).sort((a,b)=>(a.paidDate||'').localeCompare(b.paidDate||'')); }
function remindersByItem(itemId){ return data.reminders.filter(r => r.itemId === itemId); }
function undoneReminders(){ return data.reminders.filter(r => !r.done); }
function sumPayments(list){ return list.reduce((s,p)=>s + (Number(p.amount)||0), 0); }
function itemSpent(itemId){ return sumPayments(data.payments.filter(p=>p.itemId===itemId)); }
function itemStatusText(v){ const s = STATUSES.find(x=>x.v===v); return s ? s.t : '未知'; }
function catOf(item){ return item && CATEGORIES.includes(item.category) ? item.category : '其他'; }

function sortedUpcoming(){
  return undoneReminders()
    .filter(r => r.dueDate)
    .sort((a,b) => (a.dueDate||'').localeCompare(b.dueDate||''));
}

/* ================= 工具 ================= */
function save(){
  saveData(data);
}

/* 图片压缩：宽>maxW 等比缩放 -> JPEG Blob */
function compressImageFile(file, maxW){
  maxW = maxW || 1000;
  return new Promise((resolve, reject) => {
    if(!file.type || file.type.indexOf('image/') !== 0){
      reject(new Error('not-image')); return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if(blob) resolve(blob); else reject(new Error('compress-fail'));
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load-fail')); };
    img.src = url;
  });
}

function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
function dataUrlToBlob(dataUrl){
  return fetch(dataUrl).then(r => r.blob());
}

function downloadFile(name, content, mime){
  const blob = content instanceof Blob ? content : new Blob([content], {type: mime || 'application/octet-stream'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

/* ================= 导航 ================= */
function init(){
  // 底部导航
  document.getElementById('bottomNav').addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if(btn) goto(btn.dataset.page);
  });
  document.getElementById('btnQuickAdd').addEventListener('click', () => {
    openItemEditor(null);
  });
  // 全局点击代理
  document.addEventListener('click', onGlobalClick);
  // 文件导入变化
  document.addEventListener('change', onGlobalChange);
  goto('home');
  registerSW();
  afterLoadRemind();
}

function goto(p){
  currentPage = p;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === p);
  });
  render();
}

async function render(){
  const el = pageEl();
  try{
    if(currentPage === 'home') await renderHome(el);
    else if(currentPage === 'wardrobe') await renderWardrobe(el);
    else if(currentPage === 'dolls') renderDolls(el);
    else if(currentPage === 'stats') renderStats(el);
    else if(currentPage === 'settings') renderSettings(el);
  }catch(err){
    el.innerHTML = '<div class="empty">页面渲染出错：' + esc(err.message) + '</div>';
  }
}

/* ================= 看板 ================= */
async function renderHome(el){
  const totalSpent = sumPayments(data.payments);
  const inTransit = data.items.filter(i => i.status === 'in_transit').length;
  const unpaid = undoneReminders().filter(r => r.kind === '补款').length;
  const upcoming = sortedUpcoming();
  const urgent = upcoming.filter(r => {
    const dl = daysLeft(r.dueDate);
    return dl !== null && dl <= 3;
  });

  let html = '';
  // 统计卡
  html += '<div class="stat-grid">' +
    '<div class="stat-card"><div class="stat-label">衣物总数</div><div class="stat-num primary">' + data.items.length + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">在途等待</div><div class="stat-num warn">' + inTransit + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">待补尾款</div><div class="stat-num ' + (unpaid>0?'danger':'') + '">' + unpaid + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">累计支出</div><div class="stat-num primary">¥' + fmtMoney(totalSpent) + '</div></div>' +
  '</div>';

  // 提醒条
  if(urgent.length > 0){
    const over = urgent.filter(r => daysLeft(r.dueDate) < 0).length;
    const soon = urgent.length - over;
    let txt = '';
    if(over > 0) txt += over + ' 条已到期';
    if(soon > 0) txt += (txt?'，':'') + soon + ' 条将在 3 天内到期';
    html += '<div class="alert-strip">' + txt + '，请尽快处理尾款或发货事项。</div>';
  }

  // 最近待办提醒
  html += '<div class="card"><div class="card-title">待办提醒' +
    (upcoming.length ? '<span class="badge ' + (upcoming.length>0?'warn':'') + '">' + upcoming.length + '</span>' : '') + '</div>';
  if(upcoming.length === 0){
    html += '<div class="muted">暂无待办提醒。添加衣物时可在详情里录入尾款/发货提醒。</div>';
  }else{
    html += upcoming.slice(0, 10).map(r => {
      const it = itemById(r.itemId);
      const dl = daysLeft(r.dueDate);
      const cls = dl === null ? '' : (dl < 0 ? 'overdue' : (dl <= 7 ? 'soon' : ''));
      const dlTxt = dl === null ? '' : (dl < 0 ? ('已过期 ' + (-dl) + ' 天') : (dl === 0 ? '今天到期' : dl + ' 天后'));
      return '<div class="row" data-act="open-item" data-id="' + esc(r.itemId) + '">' +
        '<div class="row-avatar">' + esc((r.kind||'提')[0]) + '</div>' +
        '<div class="row-body">' +
          '<div class="row-title">' + esc(r.title || '') + (it ? ' · ' + esc(it.name) : '') + '</div>' +
          '<div class="row-sub">到期 ' + esc(r.dueDate) + (r.note ? ' · ' + esc(r.note) : '') + '</div>' +
        '</div>' +
        '<div class="row-right remind-row"><div class="days ' + cls + '">' + esc(dlTxt) + '</div>' +
        '<button class="btn btn-sm btn-ok" data-act="rem-done" data-id="' + esc(r.id) + '">完成</button></div>' +
      '</div>';
    }).join('');
  }
  html += '</div>';

  // 快捷入口
  html += '<div class="actions-row">' +
    '<button class="btn btn-primary" data-act="quick">记一笔（新衣物）</button>' +
    '<button class="btn" data-act="add-doll">添加娃娃</button>' +
    '<button class="btn" data-page-jump="stats">看统计</button>' +
  '</div>';

  el.innerHTML = html;
}

/* ================= 衣柜 ================= */
async function renderWardrobe(el){
  const q = (state.query||'').toLowerCase();
  let list = data.items.filter(it => {
    if(state.dollFilter && it.dollId !== state.dollFilter) return false;
    if(state.statusFilter && it.status !== state.statusFilter) return false;
    if(state.catFilter && catOf(it) !== state.catFilter) return false;
    if(q){
      const hay = [it.name, it.brand, it.shop, it.note, it.tags, it.sizeNotes].join(' ').toLowerCase();
      if(hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  list = list.slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));

  // 异步加载首图
  const cards = await Promise.all(list.map(async it => {
    let thumb = '';
    try{
      const phs = await photosByItem(it.id);
      if(phs && phs[0]) thumb = URL.createObjectURL(phs[0].blob);
    }catch(e){ /* 忽略 */ }
    const unpaidRem = undoneReminders().some(r => r.itemId === it.id && r.kind === '补款');
    const catCls = it.status === 'in_transit' ? 'warn' : (it.status === 'sold' ? 'gray' : (it.status === 'selling' ? 'info' : 'ok'));
    return '<div class="item-card" data-act="open-item" data-id="' + esc(it.id) + '">' +
      '<div class="item-thumb">' + (thumb ? '<img src="' + thumb + '" alt="">' : '暂无照片') + '</div>' +
      '<div class="item-body">' +
        '<div class="item-name">' + esc(it.name) + '</div>' +
        '<div class="item-meta"><span>' + esc(dollById(it.dollId) ? dollById(it.dollId).name : '通用') + '</span><span>' + esc(it.brand || '') + '</span></div>' +
        '<div class="item-badges">' +
          '<span class="badge ' + catCls + '">' + esc(itemStatusText(it.status)) + '</span>' +
          '<span class="badge gray">' + esc(catOf(it)) + '</span>' +
          (it.purchaseDate ? '<span class="badge gray">' + esc(it.purchaseDate.slice(0,7)) + '</span>' : '') +
          (unpaidRem ? '<span class="badge danger">待补尾款</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }));

  el.innerHTML =
    '<div class="filters">' +
      '<input type="text" class="grow" id="fSearch" placeholder="搜索名称/品牌/店名/备注…" value="' + esc(state.query) + '">' +
    '</div>' +
    '<div class="filters">' +
      '<select id="fDoll"><option value="">全部娃娃</option>' + data.dolls.map(d=>'<option value="' + esc(d.id) + '"' + (state.dollFilter===d.id?' selected':'') + '>' + esc(d.name) + '（' + esc(d.size||'') + '）</option>').join('') + '<option value="__all__"' + (state.dollFilter==='__all__'?' selected':'') + '>通用/无主</option></select>' +
      '<select id="fStatus"><option value="">全部状态</option>' + STATUSES.map(s=>'<option value="' + s.v + '"' + (state.statusFilter===s.v?' selected':'') + '>' + esc(s.t) + '</option>').join('') + '</select>' +
      '<select id="fCat"><option value="">全部分类</option>' + CATEGORIES.map(c=>'<option value="' + esc(c) + '"' + (state.catFilter===c?' selected':'') + '>' + esc(c) + '</option>').join('') + '</select>' +
    '</div>' +
    (list.length === 0
      ? '<div class="empty"><div class="empty-title">衣柜还是空的</div>点右上角「记一笔」，把第一件娃衣收进来吧。</div>'
      : '<div class="grid-list">' + cards.join('') + '</div>');

  const s = el.querySelector('#fSearch'), sd = el.querySelector('#fDoll'), ss = el.querySelector('#fStatus'), sc = el.querySelector('#fCat');
  s.addEventListener('input', () => { state.query = s.value; renderWardrobe(pageEl()); });
  sd.addEventListener('change', () => { state.dollFilter = sd.value; renderWardrobe(pageEl()); });
  ss.addEventListener('change', () => { state.statusFilter = ss.value; renderWardrobe(pageEl()); });
  sc.addEventListener('change', () => { state.catFilter = sc.value; renderWardrobe(pageEl()); });
}

/* ================= 娃娃 ================= */
function renderDolls(el){
  const dollStats = data.dolls.map(d => {
    const its = itemsByDoll(d.id);
    const spent = sumPayments(data.payments.filter(p => {
      const it = itemById(p.itemId);
      return it && it.dollId === d.id;
    }));
    const inTransit = its.filter(i => i.status === 'in_transit').length;
    return {d, count: its.length, spent, inTransit};
  });
  const genCount = data.items.filter(i => i.dollId === DOLL_ALL).length;
  const genSpent = sumPayments(data.payments.filter(p => {
    const it = itemById(p.itemId);
    return it && it.dollId === DOLL_ALL;
  }));

  let html = '';
  html += '<div class="actions-row" style="margin-bottom:10px"><button class="btn btn-primary" data-act="add-doll">+ 添加娃娃</button></div>';
  if(data.dolls.length === 0 && genCount === 0){
    html += '<div class="empty"><div class="empty-title">还没有娃娃档案</div>先添加你的娃娃（尺寸可选三分/四分/六分等），衣物就能按娃归类了。</div>';
    return el.innerHTML = html;
  }

  const rows = dollStats.map(x => {
    const d = x.d;
    return '<div class="card" style="padding:0 14px"><div class="row" data-act="edit-doll" data-id="' + esc(d.id) + '">' +
      '<div class="row-avatar">' + esc((d.name||'娃')[0]) + '</div>' +
      '<div class="row-body">' +
        '<div class="row-title">' + esc(d.name) + ' <span class="badge gray">' + esc(d.size || '尺寸未填') + '</span></div>' +
        '<div class="row-sub">' + (d.note ? esc(d.note) + ' · ' : '') + '衣物 ' + x.count + ' 件 · 在途 ' + x.inTransit + ' · 支出 ¥' + fmtMoney(x.spent) + '</div>' +
      '</div>' +
      '<div class="row-right">编辑</div>' +
    '</div></div>';
  }).join('');
  html += rows;

  if(genCount > 0){
    html += '<div class="card" style="padding:0 14px"><div class="row">' +
      '<div class="row-avatar" style="background:#f0f0f4;color:#8b87a3">通</div>' +
      '<div class="row-body"><div class="row-title">通用 / 未指定</div>' +
      '<div class="row-sub">衣物 ' + genCount + ' 件 · 支出 ¥' + fmtMoney(genSpent) + '</div></div></div></div>';
  }
  el.innerHTML = html;
}

/* ================= 统计 ================= */
function renderStats(el){
  const pays = data.payments;
  const total = sumPayments(pays);
  const now = new Date();
  const months = [];
  for(let i = 11; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    const label = String(d.getFullYear()).slice(2) + '/' + pad(d.getMonth() + 1);
    months.push({key, label, v: 0});
  }
  pays.forEach(p => {
    if(!p.paidDate) return;
    const k = String(p.paidDate).slice(0, 7);
    const m = months.find(x => x.key === k);
    if(m) m.v += Number(p.amount) || 0;
  });
  const maxMonth = Math.max(1, ...months.map(m => m.v));

  // 分类汇总
  const catMap = {};
  pays.forEach(p => {
    const it = itemById(p.itemId);
    const c = it ? catOf(it) : '未分类';
    catMap[c] = (catMap[c] || 0) + (Number(p.amount) || 0);
  });
  const cats = Object.keys(catMap).map(c => ({c, v: catMap[c]})).sort((a,b)=>b.v-a.v);

  // 按娃汇总
  const dollMap = {};
  pays.forEach(p => {
    const it = itemById(p.itemId);
    const key = it && it.dollId ? (dollById(it.dollId) ? dollById(it.dollId).name : '未指定') : '通用';
    dollMap[key] = (dollMap[key] || 0) + (Number(p.amount) || 0);
  });
  const dollsList = Object.keys(dollMap).map(k => ({k, v: dollMap[k]})).sort((a,b)=>b.v-a.v);
  const maxCat = Math.max(1, ...cats.map(x => x.v));
  const maxDoll = Math.max(1, ...dollsList.map(x => x.v));

  let html = '';
  html += '<div class="card"><div class="card-title">总览</div>' +
    '<table class="table-mini">' +
    '<tr><td>累计支出</td><td class="num"><b>¥' + fmtMoney(total) + '</b></td></tr>' +
    '<tr><td>付款笔数</td><td class="num">' + pays.length + '</td></tr>' +
    '<tr><td>在途衣物</td><td class="num">' + data.items.filter(i=>i.status==='in_transit').length + '</td></tr>' +
    '<tr><td>已到货</td><td class="num">' + data.items.filter(i=>i.status==='received'||i.status==='wearing').length + '</td></tr>' +
    '</table></div>';

  html += '<div class="card"><div class="card-title">近 12 个月支出</div>';
  if(total === 0){ html += '<div class="muted">暂无支出记录，去「记一笔」里添加付款吧。</div>'; }
  else{
    html += months.map(m =>
      '<div class="bar-row"><div class="bar-label">' + m.label + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(m.v/maxMonth*100) + '%"></div></div>' +
      '<div class="bar-val">' + (m.v>0?('¥'+fmtMoney(m.v)):'') + '</div></div>'
    ).join('');
  }
  html += '</div>';

  html += '<div class="card"><div class="card-title">按分类</div>';
  if(cats.length === 0){ html += '<div class="muted">暂无数据</div>'; }
  else{
    html += cats.map(x =>
      '<div class="bar-row"><div class="bar-label">' + esc(x.c) + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(x.v/maxCat*100) + '%"></div></div>' +
      '<div class="bar-val">¥' + fmtMoney(x.v) + '</div></div>'
    ).join('');
  }
  html += '</div>';

  html += '<div class="card"><div class="card-title">按娃娃</div>';
  if(dollsList.length === 0){ html += '<div class="muted">暂无数据</div>'; }
  else{
    html += dollsList.map(x =>
      '<div class="bar-row"><div class="bar-label">' + esc(x.k) + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(x.v/maxDoll*100) + '%"></div></div>' +
      '<div class="bar-val">¥' + fmtMoney(x.v) + '</div></div>'
    ).join('');
  }
  html += '</div>';

  html += '<div class="muted">统计基于「付款记录」：定金、尾款、补款、全款等每一笔已支付金额都会计入支出。</div>';
  el.innerHTML = html;
}

/* ================= 设置 ================= */
function renderSettings(el){
  el.innerHTML =
    '<div class="card"><div class="card-title">数据备份</div>' +
      '<div class="muted mb10">所有数据只存在当前手机/浏览器本地。换手机或清缓存前请先导出备份。</div>' +
      '<div class="actions-row">' +
        '<button class="btn btn-primary" data-act="export-noimg">导出数据</button>' +
        '<button class="btn btn-primary" data-act="export-img">导出含照片</button>' +
        '<button class="btn" data-act="import-data">导入备份</button>' +
      '</div>' +
      '<div class="muted" style="margin-top:8px">含照片的备份文件较大，适合完整迁移；导入后会覆盖当前数据。</div>' +
    '</div>' +

    '<div class="card"><div class="card-title">提醒设置</div>' +
      '<div class="muted mb10">打开应用时会自动检查：已到期或 3 天内到期的补款/发货提醒会显示在看板顶部。</div>' +
      '<div class="actions-row"><button class="btn" data-act="notify-on">开启系统通知（可选）</button><button class="btn" data-act="notify-test">测试通知</button></div>' +
      '<div class="muted" style="margin-top:8px">系统通知仅在浏览器授权后、页面打开期间推送；纯本地网页无法在应用完全关闭时后台推送。</div>' +
    '</div>' +

    '<div class="card"><div class="card-title">工作日换算说明</div>' +
      '<div class="muted">商家说「N 个工作日」时：录入衣物详情 → 添加提醒 → 选「工作日估算」' +
      '输入起始日期和工作日数，系统会跳过周末自动算出到期日，并给出约等于几个月的提示（按每周 5 个工作日估算，不含法定节假日）。</div>' +
    '</div>' +

    '<div class="card"><div class="card-title">使用提示</div>' +
      '<div class="muted">1. 衣物可多张照片；2. 每件衣物可记多笔付款（定金/尾款/补款…）；' +
      '3. 提醒完成即表示该尾款/事项已处理，可在该衣物「付款记录」里补记金额；' +
      '4. 添加到手机主屏幕后体验更像 App：Safari 分享 → 添加到主屏幕，或 Chrome 菜单 → 安装应用。</div>' +
    '</div>' +

    '<div class="card"><div class="card-title danger-text">危险区</div>' +
      '<div class="actions-row"><button class="btn btn-danger" data-act="wipe-all">清空全部数据</button></div>' +
      '<div class="muted" style="margin-top:8px">会删除衣物、娃娃、付款、提醒与照片，且不可恢复。操作前请先导出备份。</div>' +
    '</div>' +

    '<div class="muted" style="text-align:center">娃衣柜 v1.0 · 纯本地 · 无网络上传</div>';
}

/* ================= 娃娃编辑 ================= */
function openDollEditor(dollId){
  const d = dollId ? dollById(dollId) : null;
  const m = openModal({
    title: d ? '编辑娃娃' : '添加娃娃',
    body: '' +
      '<div class="form-group"><label>名字</label><input type="text" id="d_name" placeholder="例如：云朵" value="' + esc(d ? d.name : '') + '"></div>' +
      '<div class="form-group"><label>尺寸</label><input type="text" id="d_size" list="dollSizes" placeholder="三分 / 四分 / 六分…" value="' + esc(d ? (d.size||'') : '') + '"><datalist id="dollSizes">' + COMMON_SIZES.map(s=>'<option value="' + esc(s) + '">').join('') + '</datalist></div>' +
      '<div class="form-group"><label>备注</label><textarea id="d_note" placeholder="肤色、素体型号、偏好风格…">' + esc(d ? d.note : '') + '</textarea></div>',
    footer: '<button class="btn" data-m-cancel>取消</button><button class="btn btn-primary" data-m-ok>保存</button>'
  });
  m.footEl.querySelector('[data-m-cancel]').addEventListener('click', m.close);
  m.footEl.querySelector('[data-m-ok]').addEventListener('click', () => {
    const name = m.bodyEl.querySelector('#d_name').value.trim();
    if(!name){ toast('请填写娃娃名字'); return; }
    const size = m.bodyEl.querySelector('#d_size').value.trim();
    const note = m.bodyEl.querySelector('#d_note').value.trim();
    if(d){
      d.name = name; d.size = size; d.note = note;
      toast('已保存');
    }else{
      data.dolls.push({id: uid(), name, size, note, createdAt: new Date().toISOString()});
      toast('娃娃已添加');
    }
    save();
    m.close();
    render();
  });
}

/* ================= 衣物编辑（核心） ================= */
function openItemEditor(itemId){
  const item = itemId ? itemById(itemId) : null;
  let working = {
    photos: item ? item.photos.slice() : [],       // 照片 id 顺序
    newPhotoIds: [],                                // 本次新增照片（未保存前若取消则删除）
    removedPhotos: [],                              // 本次删除的旧照片 id
    payBuffer: [],                                  // 新增付款（保存时写入）
    remBuffer: [],                                  // 新增提醒（保存时写入）
    isNew: !item
  };

  const dollOpts = '<option value=""' + (item&&!item.dollId?' selected':'') + '>通用 / 未指定</option>' +
    data.dolls.map(d => '<option value="' + esc(d.id) + '"' + (item && item.dollId === d.id ? ' selected' : '') + '>' + esc(d.name) + '（' + esc(d.size||'') + '）</option>').join('');

  const m = openModal({
    title: item ? '编辑衣物' : '记一笔 · 新衣物',
    body: '<div class="section-title">基础信息</div>' +
      '<div class="form-group"><label>名称 *</label><input type="text" id="f_name" placeholder="例如：云朵家 玫瑰甜心 连衣裙" value="' + esc(item ? item.name : '') + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>所属娃娃</label><select id="f_doll">' + dollOpts + '</select></div>' +
        '<div class="form-group"><label>状态</label><select id="f_status">' + STATUSES.map(s=>'<option value="' + s.v + '"' + (item&&item.status===s.v?' selected':'') + '>' + esc(s.t) + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>分类</label><select id="f_cat">' + CATEGORIES.map(c=>'<option value="' + esc(c) + '"' + (item&&item.category===c?' selected':'') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label>购入时间</label><input type="date" id="f_pdate" value="' + esc(item ? (item.purchaseDate||'') : todayStr()) + '"></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>品牌 / 店名</label><input type="text" id="f_brand" value="' + esc(item ? item.brand : '') + '"></div>' +
        '<div class="form-group"><label>店铺链接/单号</label><input type="text" id="f_shop" value="' + esc(item ? item.shop : '') + '"></div>' +
      '</div>' +
      '<div class="form-group"><label>适用尺寸备注</label><input type="text" id="f_sizeNotes" placeholder="例如：三分可穿 / 约 60cm 娃" value="' + esc(item ? item.sizeNotes : '') + '"></div>' +
      '<div class="form-group"><label>标签（逗号分隔）</label><input type="text" id="f_tags" placeholder="例如：甜系, 官网, 绝版" value="' + esc(item ? item.tags : '') + '"></div>' +
      '<div class="form-group"><label>备注</label><textarea id="f_note" placeholder="到手感受、是否熨烫、瑕疵…">' + esc(item ? item.note : '') + '</textarea></div>' +

      '<div class="section-title">照片</div>' +
      '<div id="phBox"></div>' +

      '<div class="section-title">付款记录（支出统计依据）</div>' +
      '<div id="payList"></div>' +
      '<div class="form-row mt8">' +
        '<div class="form-group"><select id="pay_type">' + PAY_TYPES.map(t=>'<option value="' + esc(t) + '">' + esc(t) + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><input type="number" id="pay_amount" placeholder="金额 ¥" min="0" step="0.01" inputmode="decimal"></div>' +
        '<div class="form-group"><input type="date" id="pay_date" value="' + todayStr() + '"></div>' +
        '<button class="btn btn-ok btn-sm" id="pay_add">添加</button>' +
      '</div>' +
      '<div class="muted">定金/尾款/补款都会计入统计；补款完成为「已补」可在提醒处一键完成。</div>' +

      '<div class="section-title">尾款 / 发货提醒</div>' +
      '<div id="remList"></div>' +
      '<div class="form-row mt8">' +
        '<div class="form-group"><select id="rem_kind">' + REM_KINDS.map(t=>'<option value="' + esc(t) + '">' + esc(t) + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><input type="date" id="rem_date" value=""></div>' +
      '</div>' +
      '<div class="form-group"><label>备注（可选）</label><input type="text" id="rem_note" placeholder="例如：补款 300 元"></div>' +
      '<div class="form-group" style="background:#f7f6ff;border-radius:10px;padding:10px">' +
        '<div class="small" style="font-weight:700;color:var(--primary);margin-bottom:6px">工作日换算（跳过周末）</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>起始日期</label><input type="date" id="rem_start"></div>' +
          '<div class="form-group"><label>N 个工作日</label><input type="number" id="rem_workdays" min="1" placeholder="如 30"></div>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" id="rem_calc">算出到期日并填入上方</button>' +
        '<div class="hint" id="rem_calc_hint"></div>' +
      '</div>' +
      '<div class="actions-row"><button class="btn btn-ok" id="rem_add">添加提醒</button></div>' +

      (item ? '<div class="divider"></div><div class="actions-row"><button class="btn btn-danger" data-act="del-item-in-modal" data-id="' + esc(item.id) + '">删除这件衣物</button></div>' : ''),
    footer: '<button class="btn" data-m-cancel>取消</button><button class="btn btn-primary" data-m-save>保存</button>',
    onClose: () => {
      // 未保存就关闭时，清理本次新增但未入库的照片
      if(!working.saved){
        working.newPhotoIds.forEach(id => { photoDelete(id).catch(()=>{}); });
      }
    }
  });

  m.footEl.querySelector('[data-m-cancel]').addEventListener('click', m.close);
  m.footEl.querySelector('[data-m-save]').addEventListener('click', () => saveItemFromModal(item, m, working));

  // 初始渲染子区块
  renderPhBox(m.bodyEl, working, item);
  renderPayList(m.bodyEl, item, working);
  renderRemList(m.bodyEl, item, working);

  // 绑定添加付款
  m.bodyEl.querySelector('#pay_add').addEventListener('click', () => {
    const type = m.bodyEl.querySelector('#pay_type').value;
    const amount = parseFloat(m.bodyEl.querySelector('#pay_amount').value);
    const date = m.bodyEl.querySelector('#pay_date').value;
    if(!(amount > 0)){ toast('请填写金额'); return; }
    working.payBuffer.push({id: uid(), type, amount, paidDate: date, note: ''});
    m.bodyEl.querySelector('#pay_amount').value = '';
    renderPayList(m.bodyEl, item, working);
  });

  // 绑定添加提醒
  m.bodyEl.querySelector('#rem_add').addEventListener('click', () => {
    const kind = m.bodyEl.querySelector('#rem_kind').value;
    const dueDate = m.bodyEl.querySelector('#rem_date').value;
    const note = m.bodyEl.querySelector('#rem_note').value.trim();
    if(!dueDate){ toast('请先选择到期日期，或用工作日换算填入'); return; }
    working.remBuffer.push({id: uid(), kind, dueDate, note});
    m.bodyEl.querySelector('#rem_date').value = '';
    m.bodyEl.querySelector('#rem_note').value = '';
    renderRemList(m.bodyEl, item, working);
  });

  // 工作日换算
  m.bodyEl.querySelector('#rem_calc').addEventListener('click', () => {
    const start = m.bodyEl.querySelector('#rem_start').value;
    const wd = parseInt(m.bodyEl.querySelector('#rem_workdays').value, 10);
    if(!start || !(wd >= 1)){ toast('请填写起始日期和工作日数'); return; }
    const due = addWorkdays(start, wd);
    const hint = m.bodyEl.querySelector('#rem_calc_hint');
    if(!due){ hint.textContent = '换算失败'; return; }
    m.bodyEl.querySelector('#rem_date').value = due;
    const natural = estimateNaturalDays(wd);
    hint.textContent = start + ' 起 ' + wd + ' 个工作日 ≈ ' + natural + ' 个自然日，约 ' + daysToMonthText(natural) + '，到期日（已跳过周末）：' + due + '（法定节假日未扣除）';
  });

  // 照片添加
  m.bodyEl.querySelector('#phAddBtn').addEventListener('click', () => {
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = 'image/*';
    fi.multiple = true;
    fi.addEventListener('change', async () => {
      const files = Array.from(fi.files || []);
      for(const f of files){
        try{
          const blob = await compressImageFile(f, 1000);
          const pid = uid();
          await photoPut({id: pid, itemId: item ? item.id : '', blob});
          working.photos.push(pid);
          working.newPhotoIds.push(pid);
          renderPhBox(m.bodyEl, working, item);
        }catch(e){
          if(e.message === 'not-image') toast('只能选择图片文件');
          else toast('照片处理失败');
        }
      }
    });
    fi.click();
  });
}

function renderPhBox(bodyEl, working, item){
  const box = bodyEl.querySelector('#phBox');
  if(!box) return;
  let html = '<div class="photo-grid">';
  working.photos.forEach(pid => {
    html += '<div class="photo-cell" data-ph="' + pid + '"><img data-ph-img="' + pid + '" alt=""><button class="photo-del" data-ph-del="' + pid + '">x</button></div>';
  });
  html += '<div class="photo-add" id="phAddBtn">添加照片</div></div>';
  box.innerHTML = html;
  // 加载每个照片
  working.photos.forEach(pid => {
    photoGet(pid).then(rec => {
      if(rec && rec.blob){
        const img = box.querySelector('[data-ph-img="' + pid + '"]');
        if(img){ img.src = URL.createObjectURL(rec.blob); img.style.cursor = 'zoom-in'; }
      }
    }).catch(()=>{});
  });
  const delBtns = box.querySelectorAll('[data-ph-del]');
  delBtns.forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const pid = b.dataset.phDel;
    working.photos = working.photos.filter(p => p !== pid);
    if(working.newPhotoIds.includes(pid)){
      working.newPhotoIds = working.newPhotoIds.filter(x => x !== pid);
      photoDelete(pid).catch(()=>{});
    }else{
      working.removedPhotos.push(pid);
    }
    renderPhBox(bodyEl, working, item);
  }));
  const imgs = box.querySelectorAll('[data-ph-img]');
  imgs.forEach(img => img.addEventListener('click', () => {
    photoGet(img.dataset.phImg).then(rec => {
      if(rec && rec.blob){ lightboxBlob(rec.blob); }
    }).catch(()=>{});
  }));
  // 重新挂载添加按钮
  const addBtn = box.querySelector('#phAddBtn');
  addBtn.style.display = 'flex';
  addBtn.addEventListener('click', () => {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true;
    fi.addEventListener('change', async () => {
      for(const f of Array.from(fi.files || [])){
        try{
          const blob = await compressImageFile(f, 1000);
          const pid = uid();
          await photoPut({id: pid, itemId: item ? item.id : '', blob});
          working.photos.push(pid); working.newPhotoIds.push(pid);
          renderPhBox(bodyEl, working, item);
        }catch(e){ toast(e.message === 'not-image' ? '只能选择图片文件' : '照片处理失败'); }
      }
    });
    fi.click();
  });
}

function renderPayList(bodyEl, item, working){
  const listEl = bodyEl.querySelector('#payList');
  if(!listEl) return;
  const existing = item ? paymentsByItem(item.id) : [];
  const rows = existing.concat(working.payBuffer);
  if(rows.length === 0){
    listEl.innerHTML = '<div class="muted">还没有付款记录。付了定金/尾款就记一笔，支出统计会自动更新。</div>';
    return;
  }
  let html = '';
  rows.forEach(p => {
    const isBuf = working.payBuffer.some(x => x.id === p.id);
    html += '<div class="mini-row"><span class="badge ' + (p.type==='定金'||p.type==='尾款'||p.type==='补款' ? 'info' : 'gray') + '">' + esc(p.type) + '</span>' +
      '<span class="grow">¥' + fmtMoney(p.amount) + ' · ' + esc(p.paidDate || '未填日期') + (isBuf ? ' <span class="muted">(未保存)</span>' : '') + '</span>' +
      (isBuf ? '<button class="icon-btn" data-buf-del="' + esc(p.id) + '">x</button>' : '<button class="icon-btn" data-exist-del="' + esc(p.id) + '">x</button>') +
    '</div>';
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll('[data-buf-del]').forEach(b => b.addEventListener('click', () => {
    working.payBuffer = working.payBuffer.filter(x => x.id !== b.dataset.bufDel);
    renderPayList(bodyEl, item, working);
  }));
  listEl.querySelectorAll('[data-exist-del]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.existDel;
    data.payments = data.payments.filter(x => x.id !== id);
    save();
    renderPayList(bodyEl, item, working);
  }));
}

function renderRemList(bodyEl, item, working){
  const listEl = bodyEl.querySelector('#remList');
  if(!listEl) return;
  const existing = item ? undoneReminders().filter(r => r.itemId === item.id) : [];
  const rows = existing.concat(working.remBuffer);
  if(rows.length === 0){
    listEl.innerHTML = '<div class="muted">还没有提醒。补款/发货日期定下来后加一条，打开应用就会在看板提醒你。</div>';
    return;
  }
  let html = '';
  rows.forEach(r => {
    const isBuf = working.remBuffer.some(x => x.id === r.id);
    const dl = daysLeft(r.dueDate);
    const cls = dl === null ? '' : (dl < 0 ? 'overdue' : (dl <= 7 ? 'soon' : ''));
    html += '<div class="mini-row"><span class="badge ' + (r.kind==='补款'?'warn':(r.kind==='发货'?'info':'gray')) + '">' + esc(r.kind) + '</span>' +
      '<span class="grow"><b>' + esc(r.dueDate) + '</b> ' + (dl===null?'':(dl<0?'已过期 '+(-dl)+' 天':dl+' 天后')) + (r.note?' · '+esc(r.note):'') + (isBuf?' <span class="muted">(未保存)</span>':'') + '</span>' +
      (isBuf
        ? '<button class="icon-btn" data-rem-buf-del="' + esc(r.id) + '">x</button>'
        : '<button class="btn btn-sm btn-ok" data-rem-done-m="' + esc(r.id) + '">完成</button><button class="icon-btn" data-rem-del-m="' + esc(r.id) + '">x</button>') +
    '</div>';
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll('[data-rem-buf-del]').forEach(b => b.addEventListener('click', () => {
    working.remBuffer = working.remBuffer.filter(x => x.id !== b.dataset.remBufDel);
    renderRemList(bodyEl, item, working);
  }));
  listEl.querySelectorAll('[data-rem-done-m]').forEach(b => b.addEventListener('click', () => {
    const r = data.reminders.find(x => x.id === b.dataset.remDoneM);
    if(r){ r.done = true; r.doneAt = new Date().toISOString(); save(); toast('已标记完成'); renderRemList(bodyEl, item, working); }
  }));
  listEl.querySelectorAll('[data-rem-del-m]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.remDelM;
    data.reminders = data.reminders.filter(x => x.id !== id);
    save();
    renderRemList(bodyEl, item, working);
  }));
}

/* 从模态框保存衣物 */
function saveItemFromModal(item, m, working){
  const name = m.bodyEl.querySelector('#f_name').value.trim();
  if(!name){ toast('请填写衣物名称'); return; }
  const dollId = m.bodyEl.querySelector('#f_doll').value;
  const status = m.bodyEl.querySelector('#f_status').value;
  const category = m.bodyEl.querySelector('#f_cat').value;
  const purchaseDate = m.bodyEl.querySelector('#f_pdate').value;
  const brand = m.bodyEl.querySelector('#f_brand').value.trim();
  const shop = m.bodyEl.querySelector('#f_shop').value.trim();
  const sizeNotes = m.bodyEl.querySelector('#f_sizeNotes').value.trim();
  const tags = m.bodyEl.querySelector('#f_tags').value.trim();
  const note = m.bodyEl.querySelector('#f_note').value.trim();

  const nowIso = new Date().toISOString();
  let id;
  if(item){
    item.name = name; item.dollId = dollId; item.status = status; item.category = category;
    item.purchaseDate = purchaseDate; item.brand = brand; item.shop = shop;
    item.sizeNotes = sizeNotes; item.tags = tags; item.note = note;
    item.updatedAt = nowIso;
    id = item.id;
  }else{
    id = uid();
    data.items.push({id, dollId, name, category, brand, shop, sizeNotes, status, purchaseDate, tags, note, photos: [], createdAt: nowIso, updatedAt: nowIso});
  }
  // 照片：更新条目照片列表；新照片若 itemId 不匹配则回写归属
  const cur = item ? item : data.items.find(x => x.id === id);
  cur.photos = working.photos.slice();
  Promise.all(working.newPhotoIds.map(pid =>
    photoGet(pid).then(rec => {
      if(rec && rec.blob && rec.itemId !== id){
        return photoPut({id: pid, itemId: id, blob: rec.blob});
      }
    }).catch(()=>{})
  )).catch(()=>{});
  // 删除被移除的旧照片（本次编辑中被删、且原本已入库的）
  working.removedPhotos.forEach(pid => photoDelete(pid).catch(()=>{}));
  // 付款 & 提醒写入
  working.payBuffer.forEach(p => { p.itemId = id; data.payments.push(p); });
  working.remBuffer.forEach(r => { r.itemId = id; r.done = false; r.doneAt = ''; r.createdAt = nowIso; data.reminders.push(r); });
  save();
  working.saved = true;
  toast(item ? '已保存' : '已记一笔');
  m.close();
  render();
}

/* ================= 图片灯箱 ================= */
function lightboxBlob(blob){
  const url = URL.createObjectURL(blob);
  const m = openModal({
    title: '照片预览',
    body: '<div style="text-align:center"><img src="' + url + '" style="max-width:100%;max-height:70vh;border-radius:8px"></div>',
    footer: '<button class="btn" data-m-cancel>关闭</button>'
  });
  m.footEl.querySelector('[data-m-cancel]').addEventListener('click', m.close);
}

/* ================= 全局点击 ================= */
function onGlobalClick(e){
  const t = e.target.closest('[data-act]');
  if(t){
    const act = t.dataset.act, id = t.dataset.id;
    if(act === 'quick'){ openItemEditor(null); return; }
    if(act === 'add-doll'){ openDollEditor(null); return; }
    if(act === 'edit-doll'){ openDollEditor(id); return; }
    if(act === 'open-item'){ const it = itemById(id); if(it) openItemEditor(id); return; }
    if(act === 'rem-done'){
      const r = data.reminders.find(x => x.id === id);
      if(r){
        r.done = true; r.doneAt = new Date().toISOString(); save();
        toast(r.kind === '补款' ? '已标记补款完成，记得去详情补记金额' : '已完成');
        render();
      }
      return;
    }
    if(act === 'del-item-in-modal'){
      const it = itemById(id);
      if(it){
        confirmDlg('删除衣物', '确定删除「' + esc(it.name) + '」？其照片、付款记录与提醒会一并删除，不可恢复。', '删除', true).then(ok => {
          if(!ok) return;
          data.items = data.items.filter(x => x.id !== id);
          data.payments = data.payments.filter(x => x.itemId !== id);
          data.reminders = data.reminders.filter(x => x.itemId !== id);
          const phs = it.photos || [];
          phs.forEach(pid => photoDelete(pid).catch(()=>{}));
          save();
          toast('已删除');
          // 关闭当前模态（通过再次渲染替代：找到 mask 关闭）
          const masks = document.querySelectorAll('.modal-mask');
          masks.forEach(mk => mk.parentNode && mk.parentNode.removeChild(mk));
          render();
        });
      }
      return;
    }
    if(act === 'export-noimg'){ exportData(false); return; }
    if(act === 'export-img'){ exportData(true); return; }
    if(act === 'import-data'){ triggerImport(); return; }
    if(act === 'notify-on'){ askNotify(); return; }
    if(act === 'notify-test'){ testNotify(); return; }
    if(act === 'wipe-all'){ wipeAll(); return; }
  }
  // 页面跳转按钮
  const jump = e.target.closest('[data-page-jump]');
  if(jump){ goto(jump.dataset.pageJump); }
}

function onGlobalChange(e){
  const inp = e.target;
  if(inp && inp.id === 'importFileInput'){
    handleImportFile(inp);
  }
}

/* ================= 导出/导入 ================= */
async function exportData(includePhotos){
  const out = JSON.parse(JSON.stringify(data));
  out.app = 'bjd-wardrobe';
  out.exportedAt = new Date().toISOString();
  if(includePhotos){
    toast('正在打包照片…');
    try{
      const all = await photoGetAll();
      out.photos = [];
      for(const rec of all){
        try{
          const du = await blobToDataURL(rec.blob);
          out.photos.push({id: rec.id, itemId: rec.itemId || '', dataUrl: du});
        }catch(e){ /* 跳过损坏照片 */ }
      }
    }catch(e){ /* ignore */ }
  }
  downloadFile('娃衣柜备份_' + todayStr() + (includePhotos ? '_含照片' : '') + '.json', JSON.stringify(out), 'application/json');
  toast('备份文件已导出');
}

function triggerImport(){
  let fi = document.getElementById('importFileInput');
  if(!fi){
    fi = document.createElement('input');
    fi.type = 'file';
    fi.id = 'importFileInput';
    fi.accept = '.json,application/json';
    fi.style.display = 'none';
    document.body.appendChild(fi);
  }
  fi.value = '';
  fi.click();
}

async function handleImportFile(inp){
  const file = inp.files && inp.files[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if(!obj || !Array.isArray(obj.items) || !Array.isArray(obj.dolls)){
      toast('不是有效的备份文件'); return;
    }
    const ok = await confirmDlg('导入备份', '导入将覆盖当前全部数据（衣物/娃娃/付款/提醒/照片）。建议先导出当前数据。确定继续？', '继续导入', true);
    if(!ok){ return; }
    if(Array.isArray(obj.photos) && obj.photos.length){
      await photoClearAll();
      for(const p of obj.photos){
        if(p && p.dataUrl){
          try{ const blob = await dataUrlToBlob(p.dataUrl); await photoPut({id: p.id, itemId: p.itemId || '', blob}); }catch(e){ /* 跳过 */ }
        }
      }
    }
    const clean = {dolls: obj.dolls || [], items: obj.items || [], payments: obj.payments || [], reminders: obj.reminders || []};
    clean.version = 1;
    data = clean;
    save();
    toast('导入成功');
    location.reload();
  }catch(err){
    toast('导入失败：' + err.message);
  }
}

/* ================= 通知 ================= */
function askNotify(){
  if(!('Notification' in window)){ toast('当前浏览器不支持通知'); return; }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? '通知已开启' : '未授权');
  });
}
function testNotify(){
  if(!('Notification' in window) || Notification.permission !== 'granted'){
    toast('请先点击「开启系统通知」授权'); return;
  }
  new Notification('娃衣柜提醒测试', {body: '通知可用。之后到期提醒会在打开应用时弹出。'});
}
function afterLoadRemind(){
  setTimeout(() => {
    const urgent = sortedUpcoming().filter(r => {
      const dl = daysLeft(r.dueDate);
      return dl !== null && dl <= 0;
    });
    if(urgent.length && 'Notification' in window && Notification.permission === 'granted'){
      const titles = urgent.slice(0, 3).map(r => {
        const it = itemById(r.itemId);
        return (it ? it.name + '：' : '') + r.title;
      });
      try{ new Notification('娃衣柜提醒', {body: titles.join('、') + (urgent.length > 3 ? ' 等 ' + urgent.length + ' 条' : '')}); }catch(e){}
    }
  }, 600);
}

/* ================= 清空 ================= */
async function wipeAll(){
  const ok1 = await confirmDlg('清空全部数据', '将删除衣物、娃娃、付款记录、提醒与全部照片，且无法恢复。确定要清空吗？', '清空', true);
  if(!ok1) return;
  const ok2 = await confirmDlg('二次确认', '此操作不可逆。若未备份请先取消，去「导出数据」。确认执行清空？', '确认清空', true);
  if(!ok2) return;
  clearLocalData();
  try{ await photoClearAll(); }catch(e){}
  data = defaultData();
  save();
  toast('已清空');
  location.reload();
}

/* ================= PWA ================= */
function registerSW(){
  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

/* ================= 启动 ================= */
document.addEventListener('DOMContentLoaded', init);
