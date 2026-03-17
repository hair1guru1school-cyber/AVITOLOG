require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 8787);
const AVITO_API_BASE = String(process.env.AVITO_API_BASE || 'https://api.avito.ru').replace(/\/+$/, '');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'avitolog-backend',
    avitoBase: AVITO_API_BASE
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

app.listen(PORT, () => {
  console.log('[avitolog-backend] listening on http://localhost:' + PORT);
});
