export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const billId = req.query?.bill_id || new URL(req.url, 'http://localhost').searchParams.get('bill_id');

  if (!billId) {
    return res.status(400).json({ ok: false, error: 'Sila sertakan bill_id.' });
  }

  const apiKey = process.env.BILLPLZ_API_KEY || process.env.VITE_BILLPLZ_API_KEY;
  const isSandbox = process.env.BILLPLZ_SANDBOX === 'true' || (apiKey && apiKey.startsWith('sb_'));

  if (!apiKey) {
    return res.status(200).json({
      ok: false,
      error: 'BILLPLZ_NOT_CONFIGURED',
      message: 'BILLPLZ_API_KEY belum ditetapkan.'
    });
  }

  const billplzBaseUrl = isSandbox 
    ? 'https://www.billplz-sandbox.com/api/v3' 
    : 'https://www.billplz.com/api/v3';

  try {
    const authHeader = 'Basic ' + Buffer.from(`${apiKey.trim()}:`).toString('base64');
    const billRes = await fetch(`${billplzBaseUrl}/bills/${encodeURIComponent(billId)}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    });

    const data = await billRes.json();
    if (!billRes.ok) {
      return res.status(400).json({ ok: false, error: data.description || 'Gagal menyemak status bil.' });
    }

    return res.status(200).json({
      ok: true,
      id: data.id,
      paid: data.paid,
      state: data.state,
      amount: Number(data.amount) / 100, // in RM
      paidAmount: Number(data.paid_amount || 0) / 100,
      paidAt: data.paid_at,
      doaId: data.reference_1
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || 'Ralat semasa semakan.' });
  }
}
