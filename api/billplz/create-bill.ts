interface CreateBillRequest {
  amount: number;
  doaId: string;
  pengirim: string;
  telefon?: string;
  email?: string;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    let body: CreateBillRequest = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {} as any;
      }
    }

    const { amount, doaId, pengirim, telefon, email } = body || {};

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Jumlah sumbangan tidak sah.' });
    }

    const apiKey = process.env.BILLPLZ_API_KEY || process.env.VITE_BILLPLZ_API_KEY;
    const collectionId = process.env.BILLPLZ_COLLECTION_ID || process.env.VITE_BILLPLZ_COLLECTION_ID;
    const isSandbox = process.env.BILLPLZ_SANDBOX === 'true' || (apiKey && apiKey.startsWith('sb_'));

    if (!apiKey || !collectionId) {
      return res.status(200).json({
        ok: false,
        error: 'BILLPLZ_NOT_CONFIGURED',
        message: 'Kunci BILLPLZ_API_KEY atau BILLPLZ_COLLECTION_ID belum ditetapkan di Environment Variables Vercel.'
      });
    }

    const billplzBaseUrl = isSandbox 
      ? 'https://www.billplz-sandbox.com/api/v3' 
      : 'https://www.billplz.com/api/v3';

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'kirimdoa.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const siteUrl = `${proto}://${host}`;

    const amountInCents = Math.round(Number(amount) * 100);

    const billPayload = new URLSearchParams();
    billPayload.append('collection_id', collectionId.trim());
    billPayload.append('email', (email && email.includes('@')) ? email.trim() : 'donations@yayasanannabawi.com');
    billPayload.append('mobile', telefon ? telefon.replace(/[^0-9+]/g, '') : '0149200024');
    billPayload.append('name', (pengirim || 'Hamba Allah').slice(0, 80));
    billPayload.append('amount', String(amountInCents));
    billPayload.append('description', `Sumbangan Kirim Doa (RM${amount}) - Yayasan An Nabawi`);
    billPayload.append('callback_url', `${siteUrl}/api/billplz/webhook`);
    billPayload.append('redirect_url', `${siteUrl}/?billplz_return=1&doa_id=${encodeURIComponent(doaId || '')}&amount=${amount}`);
    billPayload.append('reference_1_label', 'Doa ID');
    billPayload.append('reference_1', doaId || 'general');

    const authHeader = 'Basic ' + Buffer.from(`${apiKey.trim()}:`).toString('base64');

    const billplzRes = await fetch(`${billplzBaseUrl}/bills`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: billPayload.toString()
    });

    const billData = await billplzRes.json();

    if (!billplzRes.ok || !billData.url) {
      console.error('Billplz API Error:', billData);
      return res.status(500).json({
        ok: false,
        error: 'BILLPLZ_API_ERROR',
        details: billData.description || billData.error || 'Gagal menghubungi gerbang Billplz.'
      });
    }

    return res.status(200).json({
      ok: true,
      billId: billData.id,
      url: billData.url
    });
  } catch (err: any) {
    console.error('Create bill server error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Ralat pelayan dalaman.' });
  }
}
