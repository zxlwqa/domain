import express from "express";
import cors from "cors";
import pkg from "pg";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import compression from "compression";
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.use(compression());

app.use(express.static(path.join(__dirname, '..', 'dist'), {
  etag: true,
  lastModified: true,
  maxAge: '365d',
  immutable: true,
}));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  lastModified: true,
  maxAge: '365d',
  immutable: true,
}));

app.get('/favicon.ico', (req, res) => {
  const fromDist = path.join(__dirname, '..', 'dist', 'favicon.ico');
  const fromPublic = path.join(__dirname, '..', 'public', 'favicon.ico');
  const target = fs.existsSync(fromDist) ? fromDist : fromPublic;
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  return res.sendFile(target);
});

app.post('/api/backg', async (req, res) => {
  try {
    const { dataUrl, filename } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return error400(res, '无效的图片数据');
    }
    const maxSize = 5 * 1024 * 1024;
    const base64Part = dataUrl.split(',')[1] || '';
    const buffer = Buffer.from(base64Part, 'base64');
    if (buffer.length > maxSize) {
      return error400(res, '图片过大，限制为5MB');
    }
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,/.exec(dataUrl);
    const mime = match?.[1] || 'image/png';
    const ext = mime.split('/')[1] || 'png';
    const safeName = (filename && typeof filename === 'string' ? filename : `bg_${Date.now()}.${ext}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const outDir = path.join(__dirname, '..', 'public', 'image', 'custom');
    const outPath = path.join(outDir, safeName);
    await fs.promises.mkdir(outDir, { recursive: true });
    await fs.promises.writeFile(outPath, buffer);
    const publicUrl = `/image/custom/${safeName}`;
    return ok(res, { url: publicUrl });
  } catch (e) {
    return error500(res, e.message || '上传失败');
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initializeTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    registrar TEXT NOT NULL,
    register_date TEXT NOT NULL,
    expire_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    renewUrl TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip_address TEXT,
    device_info TEXT,
    domain TEXT,
    notification_method TEXT,
    error_details TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    warning_days TEXT NOT NULL,
    notification_enabled TEXT NOT NULL,
    notification_interval TEXT NOT NULL,
    notification_method TEXT NOT NULL,
    bg_image_url TEXT,
    carousel_interval INT,
    carousel_enabled TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}
(async () => { await initializeTables(); })();

function error400(res, e) { return res.status(400).json({ success: false, error: e }); }
function error500(res, e) { return res.status(500).json({ success: false, error: e }); }
function ok(res, data = {}) { return res.json({ success: true, ...data }); }

async function logOperation(action, details, status = "success", extra = {}) {
  try {
    await pool.query(
      `INSERT INTO logs (type, action, details, status, user_agent, ip_address, device_info, domain, notification_method, error_details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        extra.type || "operation",
        action,
        details,
        status,
        extra.user_agent || "Server-Side",
        extra.ip_address || "127.0.0.1",
        extra.device_info || null,
        extra.domain || null,
        extra.notification_method || null,
        extra.error_details || null,
      ]
    );
  } catch {
  }
}

app.get("/api/domains", async (req, res) => {
  try {
    const q = await pool.query("SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC");
    return ok(res, {domains:q.rows});
  } catch(e){ return error500(res, e.message); }
});
app.post("/api/domains", async (req, res) => {
  const body = req.body;
  if (!Array.isArray(body.domains)) return error400(res, "数据格式错误");
  try {
    const existing = await pool.query('SELECT domain FROM domains');
    const names = existing.rows.map(d=>d.domain);
    const newD = body.domains.filter(d=>!names.includes(d.domain));
    const upD = body.domains.filter(d=>names.includes(d.domain));
    const delD = names.filter(domain=>!body.domains.some(d=>d.domain===domain));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for(const domain of delD) await client.query('DELETE FROM domains WHERE domain=$1',[domain]);
      for(const d of body.domains){
        await client.query(
          `INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT(domain) DO UPDATE SET status=EXCLUDED.status, registrar=EXCLUDED.registrar, register_date=EXCLUDED.register_date, expire_date=EXCLUDED.expire_date, renewUrl=EXCLUDED.renewUrl`,
            [d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl || null]);
      }
      await client.query('COMMIT');
    }catch(e){ await client.query('ROLLBACK'); throw e}
    finally{ client.release(); }
    await logOperation('批量同步域名', JSON.stringify({new:newD.length, upd:upD.length, del:delD.length}));
    return ok(res, {message: "同步完成"})
  }catch(e){ await logOperation('批量域名同步失败', e.message, 'error'); return error500(res, e.message);}
});
app.delete("/api/domains", async (req,res)=>{
  const {domain} = req.body;
  if(!domain) return error400(res,'缺少参数');
  try {
    const q = await pool.query('SELECT domain FROM domains WHERE domain = $1',[domain]);
    if(q.rows.length===0) return error400(res, '域名不存在');
    await pool.query('DELETE FROM domains WHERE domain = $1',[domain]);
    await logOperation('删除域名',domain,'success');
    return ok(res, {message:'删除成功'});
  }catch(e){ return error500(res, e.message); }
});

app.post('/api/cloudflare', async (req,res)=>{
  const CF_KEY = process.env.CF_KEY;
  if(!CF_KEY) return error400(res,'缺少CF_KEY环境变量');
  async function fetchCloudflareDomains(apiKey){
    let zones = [], page = 1, perPage = 50;
    while(true){
      const r = await fetch(`https://api.cloudflare.com/client/v4/zones?page=${page}&per_page=${perPage}`, {
        headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'}
      });
      if(!r.ok) throw new Error('Cloudflare API_ERROR:'+r.status);
      const data = await r.json();
      if(!data.success) throw new Error('Cloudflare API 返回错误');
      zones.push(...data.result);
      if(data.result_info.count < perPage)break;
      page++;
    }
    return zones.map(zone=>({
      domain:zone.name,
      status:zone.status==='active'? 'active': 'pending',
      registrar:'Cloudflare',
      register_date:(zone.created_date || zone.created_on)?.split('T')[0]||'',
      expire_date:(zone.expiration_date? new Date(zone.expiration_date) : new Date(Date.now()+31536000000)).toISOString().split('T')[0],
      renewUrl:`https://dash.cloudflare.com/${zone.id}/domain`
    }))
  }
  try {
    const cloudflareDomains = await fetchCloudflareDomains(CF_KEY);
    if(!cloudflareDomains.length) return error400(res,'未找到任何域名');
    const existing = await pool.query('SELECT domain FROM domains');
    const existingDomainNames = existing.rows.map((d)=>d.domain);
    const newDomains = cloudflareDomains.filter(d=>!existingDomainNames.includes(d.domain));
    const updatedDomains = cloudflareDomains.filter(d=>existingDomainNames.includes(d.domain));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM domains');
      for(const d of cloudflareDomains){
        await client.query('INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES ($1, $2, $3, $4, $5, $6)',
          [d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl||null]);
      }
      await client.query('COMMIT');
    }catch(e){ await client.query('ROLLBACK'); throw e }
    finally{ client.release(); }
    await logOperation('导入Cloudflare域名', `导入${cloudflareDomains.length}个, 新增${newDomains.length}，更新${updatedDomains.length}`);
    return ok(res,{message:`成功导入${cloudflareDomains.length}个域名`,domains:cloudflareDomains,stats:{total:cloudflareDomains.length,new:newDomains.length,updated:updatedDomains.length}});
  }catch(e){ await logOperation('Cloudflare导入报错', e.message, 'error'); return error500(res, e.message); }
});

app.get('/api/logs', async (req,res)=>{
  try{
    const type = req.query.type || 'all';
    const limit = parseInt(req.query.limit)||50;
    const offset = parseInt(req.query.offset)||0;
    let query,params;
    if(type==='all'){ query='SELECT * FROM logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2'; params=[limit,offset]; }
    else { query='SELECT * FROM logs WHERE type = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3'; params=[type,limit,offset]; }
    const result = await pool.query(query,params);
    return ok(res, {logs:result.rows,pagination:{limit,offset,total:result.rows.length}});
  }catch(e){ return error500(res, e.message); }
});
app.post('/api/logs', async (req,res)=>{
  try{
    const { type, action, details, status, domain, notification_method, error_details, device_info } = req.body;
    const ua = req.headers['user-agent']||'';
    const ip = (req.headers['x-forwarded-for']||'').split(',')[0]||req.headers['x-real-ip']||'';
    await pool.query(
      'INSERT INTO logs (type, action, details, status, user_agent, ip_address, device_info, domain, notification_method, error_details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [type,action,details,status,ua,ip,device_info||null,domain||null,notification_method||null,error_details||null]);
    return ok(res, {message:'日志记录成功'});
  }catch(e){ return error500(res, e.message); }
});
app.delete('/api/logs', async (req,res)=>{
  try{
    const type = req.query.type;
    if(type && type !== 'all') await pool.query('DELETE FROM logs WHERE type = $1', [type]);
    else await pool.query('DELETE FROM logs');
    return ok(res, {message:'日志清理成功'});
  }catch(e){ return error500(res, e.message); }
});

app.post('/api/password', async (req,res)=>{
  try{
    const { password } = req.body;
    const adminPassword = process.env.PASSWORD;
    if(!adminPassword) return error500(res, '管理员密码未配置');
    if(!password) return error400(res, '密码不能为空');
    return ok(res, {success: password===adminPassword, message: password===adminPassword?'密码验证成功':'密码错误'});
  }catch(e){ return error500(res, e.message); }
});

function getDaysUntilExpiry(expire_date) {
  const today = new Date();
  const expiry = new Date(expire_date);
  return Math.ceil((expiry.getTime()-today.getTime())/86400000);
}
function isExpiringSoon(expire_date, days=15){
  const left = getDaysUntilExpiry(expire_date);
  return left<=days && left>0;
}
async function sendWeChatNotify(title, content, sendKey) {
  const r = await fetch(`https://sctapi.ftqq.com/${sendKey}.send`, {method:'POST',body:new URLSearchParams({ title, desp: content })});
  return r.json();
}
async function sendQQNotify(content, key, qq) {
  const r = await fetch(`https://qmsg.zendee.cn/send/${key}`, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({msg:content,qq})});
  return r.json();
}
app.get('/api/notify', async (req, res) => {
  try {
    const q = await pool.query('SELECT warning_days as "warningDays", notification_enabled as "notificationEnabled", notification_interval as "notificationInterval", notification_method as "notificationMethod", bg_image_url as "bgImageUrl", carousel_interval as "carouselInterval", carousel_enabled as "carouselEnabled" FROM notification_settings LIMIT 1');
    if(!q.rows.length) return ok(res, {settings: {
      warningDays: '15', notificationEnabled: 'true',notificationInterval: 'daily',notificationMethod: [],bgImageUrl: '',carouselInterval: 30,carouselEnabled: 'true'}});
    const row = q.rows[0];
    let methodsRaw = row.notificationMethod, methodsParsed=[];
    if(Array.isArray(methodsRaw)) methodsParsed=methodsRaw;
    else if(typeof methodsRaw==='string') { try{ methodsParsed=JSON.parse(methodsRaw);}catch{methodsParsed=[];} }
    row.notificationMethod = methodsParsed;
    row.notificationMethods = methodsParsed;
    row.warningDays = String(row.warningDays);
    row.notificationEnabled=String(row.notificationEnabled);
    row.notificationInterval=String(row.notificationInterval);
    row.carouselEnabled = String(row.carouselEnabled);
    return ok(res, {settings: row});
  } catch (e){ return error500(res, e.message); }
});
app.post('/api/notify', async (req, res) => {
  try {
    const rawBody = req.body; const body = typeof rawBody==='string'?JSON.parse(rawBody):rawBody;
    if(body && body.settings) {
      const incomingMethods = Array.isArray(body.settings?.notificationMethod)
        ? body.settings?.notificationMethod
        : (Array.isArray(body.settings?.notificationMethods)
            ? body.settings?.notificationMethods
            : []);
      const s = {
        warningDays: (body.settings?.warningDays??'15').toString(),
        notificationEnabled: (body.settings?.notificationEnabled??'true').toString(),
        notificationInterval: (body.settings?.notificationInterval??'daily').toString(),
        notificationMethod: JSON.stringify(incomingMethods),
        bgImageUrl: body.settings?.bgImageUrl??'',
        carouselInterval: parseInt(body.settings?.carouselInterval??'30')||30,
        carouselEnabled: String(body.settings?.carouselEnabled??'true'),
      };
      await pool.query('DELETE FROM notification_settings');
      await pool.query('INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method, bg_image_url, carousel_interval, carousel_enabled) VALUES ($1,$2,$3,$4,$5,$6,$7)',[s.warningDays,s.notificationEnabled,s.notificationInterval,s.notificationMethod,s.bgImageUrl,s.carouselInterval,s.carouselEnabled]);
      await logOperation('保存通知设置', '设置已保存', 'success');
      return ok(res, {message:'设置已保存'});
    }

    if(body.domains){
      let notifyMethods=[];
      if(process.env.TG_BOT_TOKEN && process.env.TG_USER_ID) notifyMethods.push('telegram');
      if(process.env.WECHAT_SENDKEY) notifyMethods.push('wechat');
      if(process.env.QMSG_KEY && process.env.QMSG_QQ) notifyMethods.push('qq');
      if(!notifyMethods.length) {
        try{
          const r = await pool.query('SELECT notification_method FROM notification_settings LIMIT 1');
          if(r.rows.length){
            const val = r.rows[0].notification_method;
            if(Array.isArray(val)) notifyMethods=val;
            else if(typeof val==='string')try{notifyMethods=JSON.parse(val);}catch{notifyMethods=['telegram'];}
          }
        }catch{notifyMethods=['telegram'];}
      }
      if(!notifyMethods.length) notifyMethods=['telegram'];
      let warningDays=15;
      try{const r=await pool.query('SELECT warning_days FROM notification_settings LIMIT 1'); if(r.rows.length) warningDays=parseInt(r.rows[0].warning_days)||15;}catch{
      }
      const expiringDomains=body.domains.filter(d=>isExpiringSoon(d.expire_date,warningDays));
      if(!expiringDomains.length) return ok(res, {message:'没有即将到期的域名'});
      const results=[];const errors=[];
      for(const method of notifyMethods){
        try{
          if(method==='telegram'){
            const botToken = process.env.TG_BOT_TOKEN, chatId = process.env.TG_USER_ID;
            if(!botToken||!chatId)throw new Error('Telegram配置未设置');
            let msg='⚠️ <b>域名到期提醒</b>\n\n以下域名将在'+warningDays+'天内到期：\n\n';
            expiringDomains.forEach(d=>{const left=getDaysUntilExpiry(d.expire_date); msg+=` <b>${d.domain}</b>\n   注册商：${d.registrar}\n   到期时间：${d.expire_date}\n   剩余天数：${left}天\n\n`; }); msg+='请及时续费以避免域名过期！';
            const telegramResponse=await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:msg,parse_mode:'HTML'})});
            if(!telegramResponse.ok){ const err = await telegramResponse.text(); throw new Error('Telegram API请求失败: '+err);} results.push({method:'telegram',ok:true});
          }else if(method==='wechat'){
            const sendKey=process.env.WECHAT_SENDKEY; if(!sendKey)throw new Error('未配置微信SendKey');
            let content=`以下域名将在${warningDays}天内到期：\n\n`;
            expiringDomains.forEach(d=>{const left=getDaysUntilExpiry(d.expire_date); content+=`域名: ${d.domain}\n注册商: ${d.registrar}\n到期时间: ${d.expire_date}\n剩余天数: ${left}天\n\n`; }); content+='请及时续费以避免域名过期！';
            await sendWeChatNotify('域名到期提醒', content, sendKey); results.push({method:'wechat',ok:true});
          }else if(method==='qq'){
            const key=process.env.QMSG_KEY, qq=process.env.QMSG_QQ; if(!key||!qq)throw new Error('未配置Qmsg酱 key或QQ号');
            let content=`以下域名将在${warningDays}天内到期：\n\n`;
            expiringDomains.forEach(d=>{const left=getDaysUntilExpiry(d.expire_date); content+=`域名: ${d.domain}\n注册商: ${d.registrar}\n到期时间: ${d.expire_date}\n剩余天数: ${left}天\n\n`; }); content+='请及时续费以避免域名过期！';
            await sendQQNotify(content, key, qq); results.push({method:'qq',ok:true});
          }else{ errors.push({method,error:'不支持的通知方式'}); }
        }catch(err){ errors.push({method, error:err.message||err}); }
      }
      return ok(res, {results, errors, success:errors.length===0});
    }
    return error400(res, '参数错误');
  } catch(e){ return error500(res, e.message); }
});

app.post('/api/webdav', async (req, res) => {
  try {
    const { action, filename } = req.body;
    const envUrl = process.env.WEBDAV_URL, envUser = process.env.WEBDAV_USER, envPass = process.env.WEBDAV_PASS;
    if (!envUrl || !envUser || !envPass) return error400(res, 'WebDAV配置不完整');
    const config = { url:envUrl, username:envUser, password:envPass, path: '/domain/domains.json' };
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    if (action === 'backup') {
      const doms = await pool.query('SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC');
      const settings = await pool.query('SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1');
      const backupData = { domains: doms.rows, settings: settings.rows[0] || {}, timestamp: new Date().toISOString(), version: '1.0.0' };
      const backupContent = JSON.stringify(backupData, null, 2);
      const webdavUrl = config.url.endsWith('/')?config.url:(config.url+'/');
      const domainFolderUrl = new URL('domain/', webdavUrl).toString();
      try{ await fetch(domainFolderUrl, {method:'MKCOL',headers:{'Authorization': `Basic ${auth}`}}); }catch{
      }
      const uploadUrl = new URL('domain/domains.json', webdavUrl).toString();
      const uR = await fetch(uploadUrl, {method:'PUT',headers:{'Authorization': `Basic ${auth}`,'Content-Type': 'application/json'},body:backupContent});
      if(!uR.ok) throw new Error('WebDAV上传失败');
      await logOperation('WebDAV备份', `成功备份 ${doms.rows.length}个域名到 domains.json`);
      return ok(res, {message:'备份成功', filename: 'domains.json', count:doms.rows.length, domainsCount: doms.rows.length, timestamp: new Date().toISOString()});
    } else if (action === 'restore') {
      const webdavUrl = config.url.endsWith('/')?config.url:(config.url+'/');
      const downloadUrl = new URL('domain/' + (filename||'domains.json'), webdavUrl).toString();
      const dR = await fetch(downloadUrl, {method:'GET', headers: {'Authorization': `Basic ${auth}`}});
      if(!dR.ok) throw new Error('WebDAV下载失败');
      const backupData = await dR.json();
      if (!backupData.domains) throw new Error('备份文件格式错误');
      await pool.query('DELETE FROM domains');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const d of backupData.domains) {
          await client.query('INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES ($1, $2, $3, $4, $5, $6)', [d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl||null]);
        }
        if (backupData.settings && Object.keys(backupData.settings).length>0) {
          await client.query('DELETE FROM notification_settings');
          await client.query('INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES ($1, $2, $3, $4)', [backupData.settings.warningDays||'15', backupData.settings.notificationEnabled||'true', backupData.settings.notificationInterval||'daily', backupData.settings.notificationMethod||'[]']);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      await logOperation('WebDAV恢复', `成功恢复 ${backupData.domains.length} 个域名`);
      return ok(res, { message: '恢复成功', count: backupData.domains.length, domainsCount: backupData.domains.length, timestamp: new Date().toISOString() });
    } else {
      return error400(res, '不支持的操作');
    }
  }catch(e){ return error500(res, e.message); }
});

async function findDomainGist(token) {
  // 获取用户的所有 Gist（处理分页，最多获取前 100 个）
  let allGists = [];
  let page = 1;
  const perPage = 30;
  
  while (page <= 3) { // 最多获取 3 页（90 个 Gist）
    const response = await fetch(`https://api.github.com/gists?page=${page}&per_page=${perPage}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Domain-Manager'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API错误: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const gists = await response.json();
    
    if (gists.length === 0) break;
    
    allGists.push(...gists);
    
    if (gists.length < perPage) break;
    
    page++;
  }
  
  // 查找所有包含 domain.json 且描述为"域名管理数据备份"的 Gist
  const matchingGists = allGists.filter(gist => 
    gist.description === '域名管理数据备份' && 
    gist.files && 
    'domain.json' in gist.files
  );
  
  if (matchingGists.length === 0) {
    return null;
  }
  
  // 如果有多个匹配的 Gist，选择最新的（按 updated_at 排序）
  matchingGists.sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  
  return matchingGists[0].id;
}

app.post('/api/gist', async (req, res) => {
  try {
    const { action, gistId } = req.body;
    const token = process.env.GIT_TOKEN;
    if (!token) return error400(res, 'Git Token未配置，请在环境变量中设置GIT_TOKEN');
    
    if (action === 'export') {
      const doms = await pool.query('SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC');
      const settings = await pool.query('SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1');
      const backupData = { domains: doms.rows, settings: settings.rows[0] || {}, timestamp: new Date().toISOString(), version: '1.0.0' };
      const content = JSON.stringify(backupData, null, 2);
      
      // 如果没有提供 Gist ID，尝试查找现有的 Gist
      let targetGistId = gistId;
      if (!targetGistId) {
        targetGistId = await findDomainGist(token);
      }
      
      const url = targetGistId ? `https://api.github.com/gists/${targetGistId}` : 'https://api.github.com/gists';
      const method = targetGistId ? 'PATCH' : 'POST';
      const gistRes = await fetch(url, {
        method,
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Domain-Manager'
        },
        body: JSON.stringify({
          description: '域名管理数据备份',
          public: false,
          files: { 'domain.json': { content } }
        })
      });
      
      if (!gistRes.ok) {
        const errorText = await gistRes.text();
        throw new Error(`GitHub API错误: ${gistRes.status} ${errorText}`);
      }
      
      const gist = await gistRes.json();
      await logOperation('Gist导出', `成功导出 ${doms.rows.length} 个域名到 Gist: ${gist.id}`, 'success');
      return ok(res, { message: '导出成功', gistId: gist.id, gistUrl: gist.html_url, domainsCount: doms.rows.length, timestamp: new Date().toISOString() });
      
    } else if (action === 'import') {
      // 如果没有提供 Gist ID，自动查找包含 domain.json 的 Gist
      let targetGistId = gistId;
      if (!targetGistId) {
        targetGistId = await findDomainGist(token);
        if (!targetGistId) {
          return error400(res, '未找到包含域名备份数据的 Gist，请先执行导出操作');
        }
      }
      
      const gistRes = await fetch(`https://api.github.com/gists/${targetGistId}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Domain-Manager'
        }
      });
      
      if (!gistRes.ok) {
        const errorText = await gistRes.text();
        throw new Error(`GitHub API错误: ${gistRes.status} ${errorText}`);
      }
      
      const gist = await gistRes.json();
      const file = gist.files['domain.json'];
      if (!file) throw new Error('Gist中未找到 domain.json 文件');
      
      let content = file.content || '';
      if (file.truncated && file.raw_url) {
        const rawRes = await fetch(file.raw_url);
        if (!rawRes.ok) throw new Error('获取Gist内容失败');
        content = await rawRes.text();
      }
      
      const backupData = JSON.parse(content);
      if (!backupData.domains || !Array.isArray(backupData.domains)) throw new Error('备份文件格式错误');
      
      await pool.query('DELETE FROM domains');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const d of backupData.domains) {
          await client.query('INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES ($1, $2, $3, $4, $5, $6)', 
            [d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl || null]);
        }
        if (backupData.settings && Object.keys(backupData.settings).length > 0) {
          await client.query('DELETE FROM notification_settings');
          await client.query('INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES ($1, $2, $3, $4)', 
            [backupData.settings.warningDays || '15', backupData.settings.notificationEnabled || 'true', backupData.settings.notificationInterval || 'daily', JSON.stringify(backupData.settings.notificationMethod || [])]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      
      await logOperation('Gist导入', `成功导入 ${backupData.domains.length} 个域名，备份时间: ${backupData.timestamp || '未知'}`, 'success');
      return ok(res, { message: '导入成功', domains: backupData.domains, domainsCount: backupData.domains.length, timestamp: backupData.timestamp || new Date().toISOString() });
      
    } else {
      return error400(res, '不支持的操作');
    }
  } catch (e) {
    return error500(res, e.message);
  }
});

app.get(/^\/(?!api|server|public|dist|favicon\.ico|logo\.webp).*/, (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.use((err, req, res) => {res.status(500).json({ success: false, error: err.message||'Internal Server Error'});});

app.listen(PORT, () => console.log(`API server running on port ${PORT}`));
