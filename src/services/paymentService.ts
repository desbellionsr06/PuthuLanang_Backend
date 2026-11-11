import https from 'https';
import { env } from '../config/env';

export function createMidtransSnapCharge(input: {
  gross_amount?: number;
  customer_name?: string;
  customer_phone?: string;
}): Promise<{ redirect_url: string; token: string }> {
  return new Promise((resolve, reject) => {
    const encodedKey = Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64');
    const amount = input.gross_amount || 18000;

    const payload = JSON.stringify({
      transaction_details: {
        order_id: `PL-TRX-${Date.now()}`,
        gross_amount: amount,
      },
      item_details: [
        {
          id: 'ITEM-01',
          price: amount,
          quantity: 1,
          name: 'Jajanan Tradisional Puthu Lanang',
        },
      ],
      customer_details: {
        first_name: input.customer_name || 'Pelanggan Puthu Lanang',
        phone: input.customer_phone || '088212383828',
      },
    });

    const req = https.request(
      {
        hostname: 'app.sandbox.midtrans.com',
        port: 443,
        path: '/snap/v1/transactions',
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodedKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.redirect_url) {
              resolve({ redirect_url: json.redirect_url, token: json.token });
            } else {
              reject(
                new Error(
                  json.error_messages ? json.error_messages[0] : 'Gagal membuat transaksi Snap.'
                )
              );
            }
          } catch {
            reject(new Error('Gagal mem-parsing respons dari Midtrans.'));
          }
        });
      }
    );

    req.on('error', (err) => reject(new Error(`Koneksi ke Midtrans gagal: ${err.message}`)));
    req.write(payload);
    req.end();
  });
}

