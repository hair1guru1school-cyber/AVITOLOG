require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 8787);
const AVITO_API_BASE = String(process.env.AVITO_API_BASE || 'https://api.avito.ru').replace(/\/+$/, '');
const PERPLEXITY_API_BASE = String(process.env.PERPLEXITY_API_BASE || 'https://api.perplexity.ai').replace(/\/+$/, '');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'avitolog-backend',
    avitoBase: AVITO_API_BASE,
    perplexityBase: PERPLEXITY_API_BASE
  });
});

app.post('/api/avito/proxy', async (req, res) => {
  try {
    const apiKey = String(req.body && req.body.apiKey ? req.body.apiKey : '').trim();
    const path = String(req.body && req.body.path ? req.body.path : '').trim();
    const method = String(req.body && req.body.method ? req.body.method : 'GET').trim().toUpperCase();
    const payload = req.body && req.body.body ? req.body.body : null;
    const query = req.body && req.body.query && typeof req.body.query === 'object' ? req.body.query : null;

    if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey is required' });
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
    res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : 'Unexpected backend error'
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

app.listen(PORT, () => {
  console.log('[avitolog-backend] listening on http://localhost:' + PORT);
});
