require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { getSupabaseStatus, pingSupabase } = require('./lib/supabase-rest');
const { previewLegacyBackup } = require('./lib/legacy-import');
const { saveRawSnapshot } = require('./lib/snapshot-import');
const { prepareSnapshot } = require('./lib/prepare-staging');
const { latestSnapshot, productionPreview, executeProductionImport, getPreviewSnapshot } = require('./lib/production-preview');
const { analyzeBackupInventory } = require('./lib/data-inventory');
const { analyzeCashPreview, buildCashImportPlan } = require('./lib/cash-preview');
const { executeCashImport, cashImportStatus } = require('./lib/cash-import');
const { analyzeWorkPreview, buildWorkImportPlan } = require('./lib/work-preview');
const { executeWorkImport, workStatus } = require('./lib/work-import');
const { analyzeContentPreview } = require('./lib/content-preview');
const contentImport = require('./lib/content-import');
const { loadBackendApp } = require('./lib/app-bootstrap');
const { finalAudit } = require('./lib/final-audit');

const app = express();
const PORT = Number(process.env.PORT || 8787);
const AVITO_API_BASE = String(process.env.AVITO_API_BASE || 'https://api.avito.ru').replace(/\/+$/, '');
const PERPLEXITY_API_BASE = String(process.env.PERPLEXITY_API_BASE || 'https://api.perplexity.ai').replace(/\/+$/, '');
const ANTHROPIC_API_BASE = String(process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com').replace(/\/+$/, '');
const LISTEN_HOST = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const CORS_ORIGIN = String(process.env.CORS_ORIGIN || '').trim();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

if (CORS_ORIGIN) {
  var origins = CORS_ORIGIN.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  app.use(
    cors({
      origin: origins.length === 1 ? origins[0] : origins,
      credentials: true
    })
  );
} else {
  app.use(cors());
}
app.use(express.json({ limit: '6mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'avitolog-backend',
    avitoBase: AVITO_API_BASE,
    perplexityBase: PERPLEXITY_API_BASE,
    anthropicBase: ANTHROPIC_API_BASE,
    database: getSupabaseStatus()
  });
});

app.get('/api/backend/status', (req, res) => {
  res.json({ ok: true, migrationMode: true, database: getSupabaseStatus() });
});

app.get('/api/backend/ping', async (req, res) => {
  try {
    res.json({ ok: true, database: await pingSupabase(req.headers.authorization || '') });
  } catch (error) {
    res.status(Number(error && error.status) || 503).json({
      ok: false,
      error: error && error.message ? error.message : 'Supabase connection failed'
    });
  }
});

app.post('/api/migration/preview', (req, res) => {
  try {
    res.json({ ok: true, preview: previewLegacyBackup(req.body) });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error && error.message ? error.message : 'Invalid legacy backup'
    });
  }
});

app.post('/api/migration/snapshot', async (req, res) => {
  try {
    const result = await saveRawSnapshot(req.body && req.body.backup, req.headers.authorization || '');
    res.json({ ok: true, result });
  } catch (error) {
    res.status(Number(error && error.status) || 500).json({
      ok: false,
      error: error && error.message ? error.message : 'Snapshot upload failed'
    });
  }
});

app.post('/api/migration/prepare', async (req, res) => {
  try {
    const result = await prepareSnapshot(req.body && req.body.checksum, req.headers.authorization || '');
    res.json({ ok: true, result });
  } catch (error) {
    res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Staging preparation failed' });
  }
});

app.get('/api/migration/latest', async (req, res) => {
  try { res.json({ ok: true, snapshot: await latestSnapshot(req.headers.authorization || '') }); }
  catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Latest snapshot lookup failed' }); }
});

app.post('/api/migration/import-preview', async (req, res) => {
  try { res.json({ ok: true, preview: await productionPreview(req.body && req.body.checksum, req.headers.authorization || '') }); }
  catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Import preview failed' }); }
});

app.get('/api/migration/preview-snapshot', async (req, res) => {
  try { res.json({ ok: true, result: await getPreviewSnapshot(req.query && req.query.checksum, req.headers.authorization || '') }); }
  catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Preview snapshot failed' }); }
});

app.get('/api/migration/data-inventory', async (req, res) => {
  try {
    const snapshot = await getPreviewSnapshot(req.query && req.query.checksum, req.headers.authorization || '');
    res.json({ ok: true, snapshot: { checksum: snapshot.checksum, migrationRunId: snapshot.migrationRunId }, inventory: analyzeBackupInventory(snapshot.backup) });
  } catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Data inventory failed' }); }
});

app.get('/api/migration/cash-preview', async (req, res) => {
  try {
    const snapshot = await getPreviewSnapshot(req.query && req.query.checksum, req.headers.authorization || '');
    res.json({ ok: true, snapshot: { checksum: snapshot.checksum, migrationRunId: snapshot.migrationRunId }, preview: analyzeCashPreview(snapshot.backup) });
  } catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Cash preview failed' }); }
});

app.get('/api/migration/cash-import-preview', async (req, res) => {
  try {
    const snapshot = await getPreviewSnapshot(req.query && req.query.checksum, req.headers.authorization || '');
    const plan = buildCashImportPlan(snapshot.backup);
    res.json({ ok: true, snapshot: { checksum: snapshot.checksum, migrationRunId: snapshot.migrationRunId }, preview: plan.summary });
  } catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Cash import preview failed' }); }
});

app.post('/api/migration/import-cash', async (req, res) => {
  try { res.json({ ok: true, result: await executeCashImport(req.body && req.body.checksum, req.body && req.body.confirmation, req.headers.authorization || '') }); }
  catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Cash import failed' }); }
});

app.get('/api/migration/cash-import-status', async (req, res) => {
  try { res.json({ ok: true, status: await cashImportStatus(req.headers.authorization || '') }); }
  catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Cash import status failed' }); }
});

app.get('/api/migration/work-preview', async (req, res) => {
  try {
    const snapshot = await getPreviewSnapshot(req.query && req.query.checksum, req.headers.authorization || '');
    res.json({ ok: true, snapshot: { checksum: snapshot.checksum, migrationRunId: snapshot.migrationRunId }, preview: analyzeWorkPreview(snapshot.backup) });
  } catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Work preview failed' }); }
});

app.get('/api/migration/work-import-preview', async (req, res) => {
  try { const snapshot=await getPreviewSnapshot(req.query&&req.query.checksum,req.headers.authorization||'');const plan=buildWorkImportPlan(snapshot.backup);res.json({ok:true,snapshot:{checksum:snapshot.checksum,migrationRunId:snapshot.migrationRunId},preview:plan.summary}); }
  catch(error){res.status(Number(error&&error.status)||500).json({ok:false,error:error&&error.message?error.message:'Work import preview failed'});}
});
app.post('/api/migration/import-work',async(req,res)=>{try{res.json({ok:true,result:await executeWorkImport(req.body&&req.body.checksum,req.body&&req.body.confirmation,req.headers.authorization||'')});}catch(error){res.status(Number(error&&error.status)||500).json({ok:false,error:error.message||'Work import failed'});}});
app.get('/api/migration/work-status',async(req,res)=>{try{res.json({ok:true,status:await workStatus(req.headers.authorization||'')});}catch(error){res.status(Number(error&&error.status)||500).json({ok:false,error:error.message||'Work status failed'});}});
app.get('/api/migration/content-preview',async(req,res)=>{try{const s=await getPreviewSnapshot(req.query&&req.query.checksum,req.headers.authorization||'');res.json({ok:true,snapshot:{checksum:s.checksum},preview:analyzeContentPreview(s.backup)});}catch(error){res.status(Number(error&&error.status)||500).json({ok:false,error:error.message||'Content preview failed'});}});
app.post('/api/migration/import-content',async(req,res)=>{try{res.json({ok:true,result:await contentImport.execute(req.body&&req.body.checksum,req.body&&req.body.confirmation,req.headers.authorization||'')});}catch(e){res.status(Number(e&&e.status)||500).json({ok:false,error:e.message});}});
app.get('/api/migration/content-status',async(req,res)=>{try{res.json({ok:true,status:await contentImport.status(req.headers.authorization||'')});}catch(e){res.status(Number(e&&e.status)||500).json({ok:false,error:e.message});}});
app.get('/api/app/bootstrap',async(req,res)=>{try{res.json({ok:true,data:await loadBackendApp(req.headers.authorization||'')});}catch(e){res.status(Number(e&&e.status)||500).json({ok:false,error:e.message||'Backend app load failed'});}});
app.get('/api/app/audit',async(req,res)=>{try{res.json({ok:true,audit:await finalAudit(req.headers.authorization||'')});}catch(e){res.status(Number(e&&e.status)||500).json({ok:false,error:e.message||'Audit failed'});}});

app.post('/api/migration/import-clients-projects', async (req, res) => {
  try { res.json({ ok: true, result: await executeProductionImport(req.body && req.body.checksum, req.body && req.body.confirmation, req.headers.authorization || '') }); }
  catch (error) { res.status(Number(error && error.status) || 500).json({ ok: false, error: error && error.message ? error.message : 'Production import failed' }); }
});

async function getAvitoAccessToken(clientId, clientSecret) {
  const cid = String(clientId || '').trim();
  const csec = String(clientSecret || '').trim();
  if (!cid || !csec) {
    throw new Error('clientId and clientSecret are required');
  }
  const tokenUrl = AVITO_API_BASE + '/token';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cid,
    client_secret: csec
  });
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: body.toString()
  });
  const tokenText = await tokenRes.text();
  let tokenData = {};
  try {
    tokenData = tokenText ? JSON.parse(tokenText) : {};
  } catch (e) {
    tokenData = { raw: tokenText };
  }
  if (!tokenRes.ok) {
    const msg =
      tokenData && (tokenData.error_description || tokenData.error || tokenData.message)
        ? String(tokenData.error_description || tokenData.error || tokenData.message)
        : 'Token request failed';
    const err = new Error('Avito token error: ' + msg);
    err.status = tokenRes.status;
    err.details = tokenData;
    throw err;
  }
  const accessToken = tokenData && tokenData.access_token ? String(tokenData.access_token) : '';
  if (!accessToken) {
    const err = new Error('Avito token response has no access_token');
    err.status = 502;
    err.details = tokenData;
    throw err;
  }
  return accessToken;
}

app.post('/api/avito/proxy', async (req, res) => {
  try {
    const apiKeyRaw = String(req.body && req.body.apiKey ? req.body.apiKey : '').trim();
    const clientId = String(req.body && req.body.clientId ? req.body.clientId : '').trim();
    const clientSecret = String(req.body && req.body.clientSecret ? req.body.clientSecret : '').trim();
    const path = String(req.body && req.body.path ? req.body.path : '').trim();
    const method = String(req.body && req.body.method ? req.body.method : 'GET').trim().toUpperCase();
    const payload = req.body && req.body.body ? req.body.body : null;
    const query = req.body && req.body.query && typeof req.body.query === 'object' ? req.body.query : null;

    let apiKey = apiKeyRaw;
    if (!apiKey && clientId && clientSecret) {
      apiKey = await getAvitoAccessToken(clientId, clientSecret);
    }
    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: 'Provide apiKey OR clientId+clientSecret'
      });
    }
    if (!path || path[0] !== '/') return res.status(400).json({ ok: false, error: 'path must start with /' });

    const qs = query ? ('?' + new URLSearchParams(query).toString()) : '';
    const url = AVITO_API_BASE + path + qs;

    const headers = {
      Authorization: 'Bearer ' + apiKey,
      Accept: 'application/json'
    };
    if (payload != null) headers['Content-Type'] = 'application/json';

    const avitoRes = await fetch(url, {
      method: method,
      headers: headers,
      body: payload != null ? JSON.stringify(payload) : undefined
    });

    const text = await avitoRes.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {}

    if (!avitoRes.ok) {
      return res.status(avitoRes.status).json({
        ok: false,
        error: 'Avito API error',
        status: avitoRes.status,
        data: data
      });
    }

    res.json({
      ok: true,
      status: avitoRes.status,
      data: data
    });
  } catch (error) {
    res.status(Number(error && error.status) || 500).json({
      ok: false,
      error: error && error.message ? error.message : 'Unexpected backend error',
      data: error && error.details ? error.details : undefined
    });
  }
});

app.post('/api/perplexity/chat', async (req, res) => {
  try {
    const apiKey = String(req.body && req.body.apiKey ? req.body.apiKey : '').trim();
    const model = String(req.body && req.body.model ? req.body.model : 'sonar').trim();
    const prompt = String(req.body && req.body.prompt ? req.body.prompt : '').trim();
    const context = String(req.body && req.body.context ? req.body.context : '').trim();

    if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey is required' });
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' });

    const payload = {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Ты аналитик рекламных данных. Отвечай кратко и по делу на русском.'
        },
        {
          role: 'user',
          content: prompt + '\n\nДанные аккаунта Avito:\n' + context
        }
      ],
      temperature: 0.2
    };

    const pplxRes = await fetch(PERPLEXITY_API_BASE + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await pplxRes.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {}

    if (!pplxRes.ok) {
      return res.status(pplxRes.status).json({
        ok: false,
        error: 'Perplexity API error',
        status: pplxRes.status,
        data: data
      });
    }

    const answerText =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      typeof data.choices[0].message.content === 'string'
        ? data.choices[0].message.content
        : '';

    res.json({
      ok: true,
      text: answerText,
      citations: Array.isArray(data && data.citations) ? data.citations : [],
      data: data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : 'Unexpected backend error'
    });
  }
});

app.post('/api/llm/anthropic', async (req, res) => {
  try {
    const apiKey = String(req.body && req.body.apiKey ? req.body.apiKey : '').trim();
    const prompt = String(req.body && req.body.prompt ? req.body.prompt : '').trim();
    const maxTokens = Math.max(256, Math.min(12000, Number(req.body && req.body.maxTokens) || 4000));
    const model = String(req.body && req.body.model ? req.body.model : 'claude-sonnet-4-20250514').trim();
    if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey is required' });
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' });

    const payload = {
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    };
    const llmResp = await fetch(ANTHROPIC_API_BASE + '/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await llmResp.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }

    if (!llmResp.ok) {
      return res.status(llmResp.status).json({
        ok: false,
        error: (data && data.error && data.error.message) ? data.error.message : 'Anthropic API error',
        status: llmResp.status,
        data: data
      });
    }
    const outText = Array.isArray(data && data.content)
      ? data.content.map(x => (x && typeof x.text === 'string') ? x.text : '').join('')
      : '';
    return res.json({
      ok: true,
      text: outText,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : 'Unexpected anthropic backend error'
    });
  }
});

app.listen(PORT, LISTEN_HOST, () => {
  console.log('[avitolog-backend] listening on http://' + LISTEN_HOST + ':' + PORT);
});
