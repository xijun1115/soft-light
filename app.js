const $ = (s) => document.querySelector(s);
const STORE_KEY = 'softlight_entries';

let entries = [];
try {
  entries = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
} catch (e) {
  entries = [];
}

let pendingMedia = [];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 安全存储：超限自动降级为纯文字
function saveEntries() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      // 丢弃图片，只保留文字
      const textOnly = entries.map(e => ({
        id: e.id,
        ts: e.ts,
        text: e.text,
        media: [],
        reply: e.reply
      }));
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(textOnly));
        alert('图片太大已自动跳过，仅保存文字内容。');
      } catch (e2) {
        // 连文字都存不下，只保留最近 20 条
        const recent = textOnly.slice(-20);
        localStorage.setItem(STORE_KEY, JSON.stringify(recent));
        entries = recent;
        alert('存储已满，已自动保留最近 20 条记录。');
      }
    }
  }
}

function renderAlbum() {
  const box = $('#albumList');
  if (!box) return;
  if (entries.length === 0) {
    box.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">还没有记录，去记一件小事吧 ✨</p>';
    return;
  }
  box.innerHTML = entries.slice().reverse().map(e => `
    <div class="card">
      <div class="date">${new Date(e.ts).toLocaleString('zh-CN')}</div>
      <div>${e.text}</div>
      ${e.media && e.media.length > 0
        ? e.media.map(m => m.type === 'image'
            ? `<img src="${m.data}" />`
            : `<video src="${m.data}" controls></video>`).join('')
        : ''}
      ${e.reply ? `<div class="reply">Soft Light：${e.reply}</div>` : ''}
    </div>
  `).join('');
}

function renderSummary() {
  const box = $('#summaryBox');
  if (!box) return;
  const now = new Date();
  const ym = now.getFullYear() + '-' + (now.getMonth() + 1);
  const monthEntries = entries.filter(e => {
    const d = new Date(e.ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) === ym;
  });
  const chars = monthEntries.map(e => e.text).join('');
  const freq = {};
  for (const c of chars) {
    if (c.trim() && c !== ' ') freq[c] = (freq[c] || 0) + 1;
  }
  const topChar = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];

  box.innerHTML = `
    <p>这个月（${ym}）你记录了 <b>${monthEntries.length}</b> 件小事。</p>
    ${topChar ? `<p>最常出现的字是「<b>${topChar[0]}</b>」。</p>` : '<p>继续记，会有发现。</p>'}
    <p>普通的一天，也被你接住了。</p>
  `;
}

// 图片压缩：避免 localStorage 爆满
function compressImage(file, maxSize = 400) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = height * maxSize / width; width = maxSize; }
        } else {
          if (height > maxSize) { width = width * maxSize / height; height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(reader.result); // 兜底
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function handleFiles(input, type) {
  for (const file of input.files) {
    if (type === 'image') {
      compressImage(file).then(dataUrl => {
        if (dataUrl) {
          pendingMedia.push({ type: 'image', data: dataUrl });
          const el = document.createElement('img');
          el.src = dataUrl;
          $('#preview').appendChild(el);
        }
      });
    } else {
      // 视频不压缩，直接读（注意：大视频仍可能爆存储）
      const reader = new FileReader();
      reader.onload = () => {
        pendingMedia.push({ type: 'video', data: reader.result });
        const el = document.createElement('video');
        el.src = reader.result;
        el.controls = true;
        $('#preview').appendChild(el);
      };
      reader.readAsDataURL(file);
    }
  }
  input.value = '';
}

// 修正：AI 函数路径为 .netlify/functions/ai
async function getAIReply(text) {
  try {
    const res = await fetch('.netlify/functions/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || '今天记了一件事' })
    });
    if (!res.ok) throw new Error('network not ok');
    const data = await res.json();
    return data.reply || '今天也值得被看见。';
  } catch (e) {
    return '今天也值得被看见。';
  }
}

// 事件绑定
const photoInput = $('#photoInput');
const videoInput = $('#videoInput');
if (photoInput) photoInput.addEventListener('change', (e) => handleFiles(e.target, 'image'));
if (videoInput) videoInput.addEventListener('change', (e) => handleFiles(e.target, 'video'));

const saveBtn = $('#saveBtn');
if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    const text = $('#entryText').value.trim();
    if (!text && pendingMedia.length === 0) return;

    const aiReplyEl = $('#aiReply');
    if (aiReplyEl) aiReplyEl.textContent = 'Soft Light 正在想……';

    const reply = await getAIReply(text);

    const entry = {
      id: uid(),
      ts: Date.now(),
      text: text,
      media: pendingMedia.slice(),
      reply: reply
    };
    entries.push(entry);
    saveEntries();

    $('#entryText').value = '';
    pendingMedia = [];
    const preview = $('#preview');
    if (preview) preview.innerHTML = '';
    if (aiReplyEl) aiReplyEl.textContent = 'Soft Light：' + reply;

    renderAlbum();
    renderSummary();
  });
}

// Tab 切换
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = $('#' + btn.dataset.tab);
    if (tab) tab.classList.add('active');
    if (btn.dataset.tab === 'album') renderAlbum();
    if (btn.dataset.tab === 'summary') renderSummary();
  });
});

// 初始化
const quotes = ['今天也辛苦了。', '普通的一天，也有光。', '你记得的事，都算数。'];
const dailyQuote = $('#dailyQuote');
if (dailyQuote) {
  dailyQuote.textContent = quotes[Math.floor(Math.random() * quotes.length)];
}
renderAlbum();
renderSummary();