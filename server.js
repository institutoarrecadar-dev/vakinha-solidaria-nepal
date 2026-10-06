const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const INFINITE_TAG = (process.env.INFINITE_TAG || '').replace(/^\$/, '').trim();
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';

  if (!auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Painel Administrativo"');
    return res.status(401).send('Acesso restrito.');
  }

  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const separator = decoded.indexOf(':');
  const password = separator >= 0 ? decoded.slice(separator + 1) : '';

  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Painel Administrativo"');
    return res.status(401).send('Senha incorreta.');
  }

  next();
}
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

function publicBaseUrl(req) {
  return BASE_URL || `${req.protocol}://${req.get('host')}`;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, infiniteTagConfigured: Boolean(INFINITE_TAG) });
});

app.post('/api/create-checkout', async (req, res) => {
  try {
    if (!INFINITE_TAG) {
      return res.status(500).json({ error: 'INFINITE_TAG não configurada no servidor.' });
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valor de doação inválido.' });
    }

    const cents = Math.round(amount * 100);
    if (cents < 100) {
      return res.status(400).json({ error: 'O valor mínimo é R$ 1,00.' });
    }

    const orderNsu = `vakinha-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const base = publicBaseUrl(req);

    const payload = {
      handle: INFINITE_TAG,
      order_nsu: orderNsu,
      redirect_url: `${base}/pagamento-concluido.html`,
      webhook_url: `${base}/webhook/infinitepay`,
      items: [
        {
          quantity: 1,
          price: cents,
          description: 'Doação - VAKINHA SOLIDÁRIA DO NEPAL'
        }
      ]
    };

    const response = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.url) {
      console.error('InfinitePay error:', response.status, data);
      return res.status(502).json({
        error: 'A InfinitePay não retornou um checkout válido.',
        details: data
      });
    }

    res.json({ checkout_url: data.url, order_nsu: orderNsu });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar o checkout.' });
  }
});

app.post('/webhook/infinitepay', (req, res) => {
  console.log('InfinitePay webhook:', JSON.stringify(req.body));
  // O webhook deve responder rapidamente. Para produção, conecte aqui
  // um banco de dados para registrar e reconciliar as doações confirmadas.
  res.sendStatus(200);
});

app.get('/pagamento-concluido.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'pagamento-concluido.html'));
});
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
