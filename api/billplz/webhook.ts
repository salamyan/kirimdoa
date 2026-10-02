export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    // Billplz webhook payload is form-urlencoded
    const body = req.body || {};
    const { id, paid, state, amount, reference_1 } = body;

    console.log(`[Billplz Webhook] Bill ID: ${id}, Paid: ${paid}, State: ${state}, Doa ID: ${reference_1}`);

    // Acknowledge receipt to Billplz immediately
    return res.status(200).send('OK');
  } catch (err: any) {
    console.error('[Billplz Webhook Error]:', err);
    return res.status(500).send('Error');
  }
}
