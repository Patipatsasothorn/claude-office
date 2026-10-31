// Claude Office — ดูการทำงานของ Claude Code แบบสดในออฟฟิศพิกเซล
// อ่าน transcript (*.jsonl) ใน ~/.claude/projects แล้วส่งสถานะให้หน้าเว็บผ่าน SSE
// ไม่มี dependency · รัน: node server.js  แล้วเปิด http://localhost:4777

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = +process.env.PORT || 4777;
const ROOT = process.env.CLAUDE_PROJECTS || path.join(os.homedir(), '.claude', 'projects');
const RECENT_MS = 24 * 3600e3;      // ติดตามไฟล์ที่ขยับภายใน 24 ชม.
const BOOT_BYTES = 768 * 1024;      // ไฟล์ใหม่อ่านย้อนหลังแค่ส่วนท้าย
const LOG_MAX = 300;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
// รหัสกันเว็บอื่นยิงคำสั่งเข้ามา · เก็บไว้ในไฟล์ให้ใช้ค่าเดิมหลังรีสตาร์ต (หน้าเว็บที่เปิดค้างจะได้ไม่โดนปฏิเสธ)
const TOKEN = (() => {
  const f = path.join(__dirname, 'hq-token.txt');
  try { const t = fs.readFileSync(f, 'utf8').trim(); if (/^[0-9a-f]{32}$/.test(t)) return t; } catch { }
  const t = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(f, t); return t;
})();

// ---------- account: ตึกละ 1 account · ตึกหลักใช้โฟลเดอร์ปกติ ส่วนตึกที่เพิ่มใช้ CLAUDE_CONFIG_DIR แยกกัน ----------
const MAX_ACCOUNTS = 5;
const ACCOUNTS_FILE = path.join(__dirname, 'hq-accounts.json');
const MAIN = { id: 'main', name: 'ตึกหลัก', slot: 0, dir: path.dirname(ROOT), main: true };
const accounts = [MAIN, ...(() => { try { return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch { return []; } })()];
const accountOf = id => accounts.find(a => a.id === id);
const saveAccounts = () => fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts.filter(a => !a.main), null, 1));
function addAccount({ name, dir }) {
  if (accounts.length >= MAX_ACCOUNTS) throw new Error(`เพิ่มได้ไม่เกิน ${MAX_ACCOUNTS} account`);
  name = String(name || '').trim().slice(0, 24);
  if (!name) throw new Error('ยังไม่ได้ตั้งชื่อตึก');
  const id = crypto.randomBytes(3).toString('hex');
  dir = String(dir || '').trim() || path.join(os.homedir(), '.claude-hq', id);
  if (!path.isAbsolute(dir)) throw new Error('พาธโฟลเดอร์ต้องเป็นพาธเต็ม');
  dir = path.resolve(dir);
  if (accounts.some(a => path.resolve(a.dir) === dir)) throw new Error('โฟลเดอร์นี้ถูกใช้กับตึกอื่นแล้ว');
  fs.mkdirSync(dir, { recursive: true });
  let slot = 1; while (accounts.some(a => a.slot === slot)) slot++;
  const acc = { id, name, slot, dir };
  accounts.push(acc); saveAccounts(); version++;
  return acc;
}
// เอาออกจากเว็บเท่านั้น ไม่ลบโฟลเดอร์หรือการล็อกอินของ account
function removeAccount(id) {
  const acc = accountOf(id);
  if (!acc) throw new Error('ไม่พบตึกนี้');
  if (acc.main) throw new Error('เอาตึกหลักออกไม่ได้');
  if ([...runs.values()].some(r => r.account === id && (r.status === 'running' || r.status === 'queued'))) throw new Error('ตึกนี้ยังมีงานค้างอยู่');
  accounts.splice(accounts.indexOf(acc), 1); saveAccounts();
  for (const [file, f] of files) if (f.account === id) files.delete(file);
  for (const [sid, s] of sessions) if (s.account === id) {
    sessions.delete(sid);
    for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].sid === sid) { inboxById.delete(inbox[i].id); inbox.splice(i, 1); }
  }
  version++;
}
// เปิดหน้าต่าง terminal ของ account นั้น ให้ผู้ใช้ล็อกอินเอง (เว็บไม่แตะรหัสผ่าน)
function openLogin(id) {
  const acc = accountOf(id);
  if (!acc) throw new Error('ไม่พบตึกนี้');
  if (process.platform !== 'win32') throw new Error('เปิดหน้าต่างให้ได้เฉพาะ Windows · รันคำสั่งที่แสดงไว้เองได้เลย');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: acc.dir }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  spawn('cmd', ['/c', 'start', 'Claude Login', 'cmd', '/k', CLAUDE_BIN], { cwd: acc.dir, env, detached: true, stdio: 'ignore' }).unref();
}
const publicAccount = a => ({ id: a.id, name: a.name, slot: a.slot, dir: a.dir, main: !!a.main,
  loggedIn: !!a.main || fs.existsSync(path.join(a.dir, '.credentials.json')) });

const files = new Map();     // path -> { offset, rest, sessionKey }
const sessions = new Map();  // key -> session
const log = [];
let version = 0;

function short(s, n = 48) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
const base = p => short(String(p || '').split(/[\\/]/).pop(), 40);

function toolInfo(name, input = {}) {
  const n = name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
  let zone = 'desk', icon = '🛠️', text = n;
  if (/^(Read)$/.test(name)) { zone = 'library'; icon = '📖'; text = base(input.file_path); }
  else if (/^(Grep|Glob)$/.test(name)) { zone = 'library'; icon = '🔎'; text = short(input.pattern, 36); }
  else if (/^(WebSearch|WebFetch)$/.test(name)) { zone = 'library'; icon = '🌐'; text = short(input.query || input.url, 40); }
  else if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(name)) { zone = 'desk'; icon = '✏️'; text = base(input.file_path || input.notebook_path); }
  else if (/^(Bash|PowerShell|Monitor|TaskStop)$/.test(name)) { zone = 'server'; icon = '💻'; text = short(input.description || input.command, 44); }
  else if (/Browser|chrome/i.test(name)) { zone = 'browser'; icon = '🖥️'; const first = (input.actions && input.actions[0] && input.actions[0].input) || {};
    text = short(input.action_summary || input.url || first.action_summary || first.url || (input.action && input.action !== 'javascript_exec' ? input.action : '') || n, 40); }
  else if (/^(Agent|Task|SendMessage)$/.test(name)) { zone = 'meeting'; icon = '👥'; text = short(input.description || 'ประชุมทีม', 40); }
  else if (/^(AskUserQuestion)$/.test(name)) { zone = 'reception'; icon = '❓'; text = 'ถามคุณอยู่'; }
  else if (/^(Artifact|show_widget|SendUserFile)$/.test(name) || /visualize|show_widget/.test(name)) { zone = 'board'; icon = '📊'; text = short(input.file_path ? base(input.file_path) : n, 40); }
  else if (/^(Skill|ToolSearch)$/.test(name)) { zone = 'library'; icon = '📚'; text = short(input.skill || input.query, 40); }
  else if (/Todo|Plan/.test(name)) { zone = 'board'; icon = '🗒️'; text = n; }
  return { tool: n, zone, icon, text };
}

function getSession(key, file, account) {
  let s = sessions.get(key);
  if (!s) {
    const dir = path.basename(path.dirname(file));
    const isSub = dir === 'subagents';
    s = {
      id: key, file, isSub, account,
      parent: isSub ? path.basename(path.dirname(path.dirname(file))) : null,
      project: '', title: '', firstPrompt: '',
      state: 'idle', zone: 'desk', icon: '☕', text: 'ว่าง',
      pending: {}, last: 0, tools: 0, outTokens: 0, edits: 0, model: '',
      recent: [],
    };
    // subagent มีไฟล์ .meta.json บอกชื่องานที่ได้รับมอบหมาย
    if (isSub) try { s.title = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')).description || ''; } catch { }
    sessions.set(key, s);
  }
  return s;
}

// ---------- กล่องเอกสาร: คำตอบสุดท้ายของแต่ละรอบงาน ----------
const inbox = [];           // { id, sid, t, text, prompt, final }
const inboxById = new Map();
function addReply(s, mid, text, t) {
  let it = inboxById.get(mid);
  if (it) { it.text += '\n\n' + text; it.t = t || it.t; }
  else {
    it = { id: mid, sid: s.id, t: t || Date.now(), text, prompt: s.lastPrompt || '', final: false };
    inbox.push(it); inboxById.set(mid, it);
    if (inbox.length > 150) inboxById.delete(inbox.shift().id);
  }
  s.lastReplyId = mid;
}
function dropReply(mid) {
  const it = inboxById.get(mid); if (!it || it.final) return;
  inboxById.delete(mid); inbox.splice(inbox.indexOf(it), 1);
}
// agent ที่สั่งจาก HQ ถูกขอให้ขึ้นต้นคำถามด้วย "❓ คำถาม" (ดู HQ_SYSTEM)
const isQuestion = text => /❓\s*คำถาม/.test(text || '');
// คำตอบนับว่า "ส่งแล้ว" เมื่อมีงานใหม่ตามมา หรือ session หยุดรอคุณเกิน 2 วินาที
function isFinal(it, now) {
  if (it.final) return true;
  const s = sessions.get(it.sid);
  return !!s && s.lastReplyId === it.id && s.state === 'done' && now - s.last > 2000;
}

function addEvent(s, ev) {
  const e = { t: ev.t || Date.now(), sid: s.id, icon: ev.icon, text: ev.text, tool: ev.tool || '' };
  s.recent.push(e); if (s.recent.length > 40) s.recent.shift();
  log.push(e); if (log.length > LOG_MAX) log.shift();
}

function handle(s, o) {
  const t = o.timestamp ? Date.parse(o.timestamp) : 0;
  if (o.type === 'custom-title' && o.customTitle) s.title = o.customTitle;
  else if (o.type === 'agent-name' && o.agentName && !s.title) s.title = o.agentName;
  else if (o.type === 'ai-title' && o.aiTitle) s.aiTitle = o.aiTitle;
  if (o.cwd) s.cwd = o.cwd;
  if (o.cwd) s.project =path.basename(o.cwd.replace(/[\\/]+$/, ''));
  if (o.type !== 'assistant' && o.type !== 'user') return;
  if (t) s.last = Math.max(s.last, t);
  const m = o.message || {};
  const content = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content || []);

  if (o.type === 'assistant') {
    if (m.model) s.model = m.model;
    if (m.usage && m.usage.output_tokens) s.outTokens += m.usage.output_tokens;
    for (const c of content) {
      if (c.type === 'tool_use') {
        if (m.id) dropReply(m.id); // ข้อความนี้ยังเรียก tool ต่อ ไม่ใช่คำตอบสุดท้าย
        const info = toolInfo(c.name || '', c.input || {});
        s.pending[c.id] = info;
        s.tools++;
        if (info.icon === '✏️') s.edits++;
        Object.assign(s, { state: 'tool', zone: info.zone, icon: info.icon, text: info.text });
        addEvent(s, { t, icon: info.icon, text: info.text, tool: info.tool });
      } else if (c.type === 'thinking') {
        if (!Object.keys(s.pending).length) Object.assign(s, { state: 'thinking', zone: 'desk', icon: '💭', text: 'กำลังคิด…' });
      } else if (c.type === 'text' && c.text && c.text.trim()) {
        if (!Object.keys(s.pending).length) {
          Object.assign(s, { state: m.stop_reason === 'tool_use' ? 'thinking' : 'done', zone: 'desk', icon: '💬', text: short(c.text, 44) });
          addEvent(s, { t, icon: '💬', text: short(c.text, 80), tool: 'reply' });
          if (!s.isSub && m.stop_reason !== 'tool_use') addReply(s, m.id || o.uuid, c.text, t);
        }
      }
    }
  } else {
    let prompt = null;
    for (const c of content) {
      if (c.type === 'tool_result') {
        delete s.pending[c.tool_use_id];
        if (!Object.keys(s.pending).length) Object.assign(s, { state: 'thinking', zone: 'desk', icon: '💭', text: 'กำลังคิด…' });
      } else if (c.type === 'text' && !o.isMeta && !/^<(system-reminder|command-|local-command|task-notification)/.test(c.text || '')) {
        prompt = c.text;
      }
    }
    if (prompt && !o.isSidechain) {
      if (!s.firstPrompt) s.firstPrompt = short(prompt, 60);
      const prev = inboxById.get(s.lastReplyId); if (prev) prev.final = true;
      s.lastPrompt = short(prompt, 300);
      s.pending = {};
      Object.assign(s, { state: 'thinking', zone: 'desk', icon: '📨', text: 'ได้รับงานใหม่' });
      addEvent(s, { t, icon: '🙋', text: 'คุณ: ' + short(prompt, 70), tool: 'prompt' });
    } else if (prompt && s.isSub && !s.firstPrompt) {
      s.firstPrompt = short(prompt, 60);
    }
  }
}

function readNew(file, st, account) {
  let f = files.get(file);
  if (!f) {
    const key = path.basename(file, '.jsonl');
    f = { offset: Math.max(0, st.size - BOOT_BYTES), rest: Buffer.alloc(0), key, account, skipFirst: st.size > BOOT_BYTES };
    files.set(file, f);
  }
  if (st.size < f.offset) { f.offset = 0; f.rest = Buffer.alloc(0); }
  if (st.size === f.offset) return false;
  const fd = fs.openSync(file, 'r');
  const len = Math.min(st.size - f.offset, 8 * 1024 * 1024);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, f.offset);
  fs.closeSync(fd);
  f.offset += len;
  let data = Buffer.concat([f.rest, buf]);
  const lastNl = data.lastIndexOf(0x0a);
  if (lastNl < 0) { f.rest = data; return false; }
  f.rest = data.subarray(lastNl + 1);
  data = data.subarray(0, lastNl);
  let lines = data.toString('utf8').split('\n');
  if (f.skipFirst) { lines.shift(); f.skipFirst = false; }
  const s = getSession(f.key, file, f.account);
  for (const line of lines) {
    if (!line) continue;
    try { handle(s, JSON.parse(line)); } catch { /* บรรทัดเสีย ข้าม */ }
  }
  return true;
}

function scan() {
  let changed = false;
  const now = Date.now();
  const check = (file, account) => {
    let st; try { st = fs.statSync(file); } catch { return; }
    if (now - st.mtimeMs > RECENT_MS && !files.has(file)) return;
    if (readNew(file, st, account)) changed = true;
  };
  for (const acc of accounts) {
    const root = acc.main ? ROOT : path.join(acc.dir, 'projects');
    let projects = [];
    try { projects = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { continue; }
    for (const p of projects) {
      const dir = path.join(root, p.name);
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.jsonl')) check(path.join(dir, e.name), acc.id);
        else if (e.isDirectory() && /^[0-9a-f-]{36}$/.test(e.name)) {
          const sub = path.join(dir, e.name, 'subagents');
          let subs = []; try { subs = fs.readdirSync(sub); } catch { continue; }
          for (const n of subs) if (n.endsWith('.jsonl')) check(path.join(sub, n), acc.id);
        }
      }
    }
  }
  if (changed) version++;
}

function snapshot() {
  const now = Date.now();
  const list = [...sessions.values()].filter(s => s.last).map(s => {
    const age = now - s.last;
    let state = s.state;
    const lastReply = inboxById.get(s.lastReplyId);
    if (state === 'done' && lastReply && isQuestion(lastReply.text) && isFinal(lastReply, now) && !runningFor(s.id)) state = 'asking';
    else if (state === 'done' && age > 10 * 60e3) state = 'away';
    else if (state !== 'done' && age > 15 * 60e3) state = 'away';
    const ask = state === 'asking';
    return {
      id: s.id, account: s.account, isSub: s.isSub, parent: s.parent, project: s.project, cwd: s.cwd || '', fromHQ: hqIds.has(s.id),
      hqBusy: !!runningFor(s.id), name: names[s.id] || '',
      title: s.title || s.aiTitle || s.firstPrompt || s.project || s.id.slice(0, 8),
      state, zone: ask ? 'reception' : state === 'away' ? 'lounge' : s.zone, icon: ask ? '❓' : state === 'away' ? '😴' : s.icon,
      text: ask ? 'มีคำถาม รอคุณตอบ' : state === 'away' ? 'พักอยู่' : s.text, last: s.last,
      tools: s.tools, edits: s.edits, outTokens: s.outTokens, model: s.model,
      recent: s.recent.slice(-15),
    };
  }).sort((a, b) => b.last - a.last);
  const cwds = [...new Set([...sessions.values()].filter(s => s.cwd && !s.isSub).sort((a, b) => b.last - a.last).map(s => s.cwd).concat(__dirname))];
  const titles = new Map(list.map(s => [s.id, s]));
  const mail = inbox.filter(it => isFinal(it, now)).slice(-60).map(it => {
    const s = titles.get(it.sid) || {};
    return { id: it.id, sid: it.sid, account: s.account || 'main', t: it.t, title: s.title || it.sid.slice(0, 8), project: s.project || '',
      preview: short(it.text, 160), len: it.text.length, prompt: short(it.prompt, 120), question: isQuestion(it.text) };
  });
  return { now, version, accounts: accounts.map(publicAccount), maxAccounts: MAX_ACCOUNTS, sessions: list, log: log.slice(-80), cwds, pc, inbox: mail, runs: [...runs.values()].slice(-10).map(publicRun) };
}

// ---------- สั่งงานจากหน้าเว็บ: เปิด claude -p แบบ headless ----------
const runs = new Map(); // runId -> run
// จำว่า session ไหนเปิดจากหน้านี้ (อยู่รอดหลังรีสตาร์ต server)
const HQ_FILE = path.join(__dirname, 'hq-sessions.json');
const hqIds = new Set((() => { try { return JSON.parse(fs.readFileSync(HQ_FILE, 'utf8')); } catch { return []; } })());
// ชื่อเล่นของแต่ละคน (ตั้งตอนสร้าง หรือเปลี่ยนทีหลังได้)
const NAMES_FILE = path.join(__dirname, 'hq-names.json');
const names = (() => { try { return JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')); } catch { return {}; } })();
function setName(id, name) {
  name = String(name || '').trim().slice(0, 24);
  if (name) names[id] = name; else delete names[id];
  try { fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 1)); } catch { }
  version++;
}
function markHQ(id) { if (hqIds.has(id)) return; hqIds.add(id); try { fs.writeFileSync(HQ_FILE, JSON.stringify([...hqIds])); } catch { } }
const MODES = { default: 'default', acceptEdits: 'acceptEdits', plan: 'plan' };

function publicRun(r) {
  return { id: r.id, cwd: r.cwd, prompt: short(r.prompt, 80), mode: r.mode, resume: !!r.resume, started: r.started, ended: r.ended,
    status: r.status, sessionId: r.sessionId, result: short(r.result, 220), error: short(r.error, 160), cost: r.cost };
}

// งานจากหน้านี้รันแบบเบื้องหลัง ไม่มีใครตอบระหว่างทาง จึงให้ถามกลับเป็นคำตอบสุดท้ายแทนการเดาเอง
const HQ_SYSTEM = [
  'คุณถูกสั่งงานจากหน้า Claude HQ และทำงานแบบเบื้องหลัง ระหว่างทำไม่มีใครกดอนุมัติสิทธิ์หรือตอบคำถามให้ได้',
  'ถ้าหาไฟล์หรือข้อมูลไม่เจอ ไม่แน่ใจว่าผู้ใช้หมายถึงอะไร มีทางเลือกที่ผู้ใช้ควรตัดสินใจ หรือติดเรื่องสิทธิ์ อย่าเดาเอง',
  'ให้หยุดแล้วจบคำตอบด้วยคำถามที่ชัดเจน โดยขึ้นบรรทัดใหม่ว่า "❓ คำถาม:" ตามด้วยสิ่งที่อยากรู้ ใส่ตัวเลือกให้ด้วยถ้ามี',
  'ผู้ใช้จะตอบกลับมาในข้อความถัดไป แล้วคุณค่อยทำงานต่อ · ตอบเป็นภาษาไทย',
].join('\n');

// ---------- รูปแนบจากการวาง/ลากรูป: เก็บเป็นไฟล์ แล้วส่งพาธให้ Claude ----------
const UPLOADS = path.join(__dirname, 'hq-uploads');
const IMAGE_EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
function saveUpload(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('รองรับเฉพาะรูป PNG, JPG, WEBP หรือ GIF');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('รูปใหญ่เกิน 10 MB');
  fs.mkdirSync(UPLOADS, { recursive: true });
  const id = crypto.randomBytes(8).toString('hex') + '.' + IMAGE_EXT[m[1]];
  fs.writeFileSync(path.join(UPLOADS, id), buf);
  return id;
}
// รับเฉพาะชื่อไฟล์ที่ saveUpload สร้าง ไม่รับพาธจากหน้าเว็บตรง ๆ
function uploadPath(id) {
  const file = path.join(UPLOADS, String(id));
  if (!/^[0-9a-f]{16}\.(png|jpg|webp|gif)$/.test(String(id)) || !fs.existsSync(file)) throw new Error('ไม่พบรูปที่แนบ');
  return file;
}

const runningFor = sid =>[...runs.values()].find(r => r.status === 'running' && r.sessionId === sid);

// resume = ส่งต่อให้คนเดิม (session เดิม) · ถ้าคนนั้นยังทำงานจากหน้านี้อยู่ ให้ต่อคิวไว้
function startRun({ prompt, cwd, mode, resume, name, account, images }) {
  prompt = String(prompt || '').trim();
  const imagePaths = (Array.isArray(images) ? images : []).map(uploadPath);
  if (!prompt && !imagePaths.length) throw new Error('ยังไม่ได้พิมพ์คำสั่ง');
  // Claude เปิดรูปจากไฟล์ด้วย Read · launch() เพิ่มสิทธิ์อ่านโฟลเดอร์รูปด้วย --add-dir
  if (imagePaths.length) prompt = (prompt || 'ดูรูปที่แนบมานี้') + '\n\nรูปที่แนบมา (เปิดดูด้วย Read ก่อนตอบ):\n' + imagePaths.join('\n');
  if (resume) {
    if (!/^[0-9a-f-]{36}$/.test(resume)) throw new Error('session id ไม่ถูกต้อง');
    const s = sessions.get(resume);
    if (!s) throw new Error('ไม่พบ session นี้');
    cwd = s.cwd || cwd; // session ผูกกับโฟลเดอร์เดิม ต้อง resume จากโฟลเดอร์นั้น
    account = s.account; // ประวัติ session อยู่ใน account เดิม ต้องทำงานต่อใน account นั้น
  }
  if (!accountOf(account || 'main')) throw new Error('ไม่พบตึกนี้');
  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('ไม่พบโฟลเดอร์โปรเจกต์: ' + cwd);
  const id = crypto.randomBytes(4).toString('hex');
  const r = { id, cwd, prompt, mode, account: account || 'main', hasImages: imagePaths.length > 0, name: resume ? '' : String(name || '').trim(), started: Date.now(), status: 'queued', sessionId: resume || '', resume: !!resume, result: '', error: '', buf: '' };
  runs.set(id, r);
  if (!(resume && runningFor(resume))) launch(r);
  version++;
  return r;
}

function launch(r) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', MODES[r.mode] || 'default',
    '--append-system-prompt', HQ_SYSTEM];
  if (r.hasImages) args.push('--add-dir', UPLOADS);
  if (r.resume) args.push('--resume', r.sessionId);
  r.status = 'running'; r.started = Date.now();
  const { prompt, cwd } = r;
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT; // ไม่ให้ติดค่าจาก session ที่เปิด server
  const acc = accountOf(r.account);
  if (acc && !acc.main) env.CLAUDE_CONFIG_DIR = acc.dir;
  const child = spawn(CLAUDE_BIN, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  r.child = child;
  child.stdin.end(prompt);
  child.stdout.on('data', d => {
    r.buf += d.toString('utf8');
    let i;
    while ((i = r.buf.indexOf('\n')) >= 0) {
      const line = r.buf.slice(0, i); r.buf = r.buf.slice(i + 1);
      try {
        const o = JSON.parse(line);
        if (o.session_id && !r.sessionId) r.sessionId = o.session_id;
        if (o.session_id && !r.resume) markHQ(o.session_id); // นับเฉพาะคนที่เริ่มใหม่จากหน้านี้
        if (o.session_id && r.name && !names[o.session_id]) setName(o.session_id, r.name);
        if (o.type === 'result') { r.result = o.result || ''; r.cost = o.total_cost_usd; if (o.is_error) r.error = o.result || o.subtype; }
      } catch { /* ไม่ใช่ JSON */ }
    }
    version++;
  });
  child.stderr.on('data', d => { r.error = (r.error + d.toString('utf8')).slice(-500); });
  const next = () => {
    const q = [...runs.values()].find(x => x.status === 'queued' && x.resume && x.sessionId === r.sessionId);
    if (q) launch(q);
  };
  child.on('error', e => { r.status = 'error'; r.error = e.message; r.ended = Date.now(); version++; next(); });
  child.on('close', code => {
    if (r.status === 'running') r.status = code === 0 && !r.error ? 'done' : 'error';
    r.ended = Date.now(); delete r.child; version++;
    next();
  });
  version++;
}

function readBody(req, max = 200e3) {
  return new Promise((ok, bad) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > max) { bad(new Error('ข้อความยาวเกิน')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { bad(e); } });
  });
}

function allowed(req) {
  const host = req.headers.host || '';
  return req.headers['x-token'] === TOKEN && (host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}`);
}

// ---------- CPU / RAM ของเครื่อง ----------
let cpuPrev = os.cpus().map(c => c.times);
const pc = { cpu: 0, ram: 0, ramUsed: 0, ramTotal: 0 };
function samplePc() {
  const now = os.cpus().map(c => c.times);
  let idle = 0, total = 0;
  now.forEach((t, i) => {
    const p = cpuPrev[i] || t;
    const d = k => t[k] - p[k];
    const all = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    idle += d('idle'); total += all;
  });
  cpuPrev = now;
  pc.cpu = total ? Math.round((1 - idle / total) * 100) : 0;
  pc.ramTotal = os.totalmem(); pc.ramUsed = pc.ramTotal - os.freemem();
  pc.ram = Math.round(pc.ramUsed / pc.ramTotal * 100);
}

const clients = new Set();
let sentVersion = -1, tick = 0;
setInterval(() => {
  scan();
  if (++tick % 2 === 0) samplePc();
  if (version !== sentVersion || tick % 2 === 0) {
    sentVersion = version;
    const msg = 'data: ' + JSON.stringify(snapshot()) + '\n\n';
    for (const c of clients) c.write(msg);
  }
}, 1000);

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: ' + JSON.stringify(snapshot()) + '\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url === '/api/reply') {
    const host = req.headers.host || '';
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const it = inboxById.get(id);
    res.writeHead(it && (host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}`) ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(it ? { id: it.id, sid: it.sid, t: it.t, text: it.text, prompt: it.prompt } : { error: 'ไม่พบเอกสารนี้' }));
  }
  if (url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(snapshot()));
  }
  if (req.method === 'POST' && (url === '/api/run' || url === '/api/stop' || url === '/api/name' || url === '/api/upload' || url.startsWith('/api/account'))) {
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
    if (!allowed(req)) return json(403, { error: 'ไม่อนุญาต' });
    readBody(req, url === '/api/upload' ? 15e6 : undefined).then(body => {
      if (url === '/api/upload') return json(200, { id: saveUpload(body.data) });
      if (url === '/api/run') return json(200, publicRun(startRun(body)));
      if (url === '/api/account') return json(200, publicAccount(addAccount(body)));
      if (url === '/api/account/remove') { removeAccount(body.id); return json(200, { ok: true }); }
      if (url === '/api/account/login') { openLogin(body.id); return json(200, { ok: true }); }
      if (url === '/api/name') { if (!sessions.has(body.id)) return json(404, { error: 'ไม่พบคนนี้' }); setName(body.id, body.name); return json(200, { ok: true }); }
      const r = runs.get(body.id);
      if (r && r.status === 'queued') { r.status = 'stopped'; r.ended = Date.now(); version++; return json(200, { ok: true }); }
      if (!r || !r.child) return json(404, { error: 'งานนี้จบไปแล้ว' });
      r.status = 'stopped'; r.child.kill();
      json(200, { ok: true });
    }).catch(e => json(400, { error: e.message }));
    return;
  }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replace('__HQ_TOKEN__', TOKEN));
  }
  const STATIC = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
  const file = path.join(__dirname, 'public', path.normalize(url).replace(/^([\\/]|\.\.)+/, ''));
  if (STATIC[path.extname(file)] && file.startsWith(path.join(__dirname, 'public')) && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': STATIC[path.extname(file)], 'Cache-Control': 'no-cache' });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end();
}).listen(PORT, '127.0.0.1', () => {
  scan();
  console.log(`Claude Office → http://localhost:${PORT}  (อ่านจาก ${ROOT})`);
});
