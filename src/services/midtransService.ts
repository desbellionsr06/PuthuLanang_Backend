import midtransClient from 'midtrans-client';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface CreateTransactionParams {
  orderId: string;
  grossAmount: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: 'qris' | 'transfer' | string;
  items?: Array<{
    id?: string;
    nama?: string;
    name?: string;
    harga?: number;
    price?: number;
    quantity?: number;
    qty?: number;
  }>;
}

export interface MidtransSnapResult {
  token: string;
  redirect_url: string;
}

// Inisialisasi Midtrans Snap SDK dalam mode Sandbox
const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-puthulanang-sandbox',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-puthulanang-sandbox',
});

/**
 * Membuat transaksi Midtrans Snap untuk pembayaran digital (QRIS & Transfer Bank Virtual Account).
 * Mengembalikan Snap Token dan Redirect URL untuk antarmuka pembayaran Flutter.
 */
export async function createMidtransTransaction(
  params: CreateTransactionParams
): Promise<MidtransSnapResult> {
  const { orderId, grossAmount, customerName, customerPhone, paymentMethod, items } = params;

  // Format detail item untuk rincian Snap Midtrans
  const formattedItems =
    Array.isArray(items) && items.length > 0
      ? items.map((it, idx) => ({
          id: it.id || `ITEM-${idx + 1}`,
          price: Number(it.harga || it.price || grossAmount),
          quantity: Number(it.quantity || it.qty || 1),
          name: (it.nama || it.name || 'Jajanan Puthu Lanang').substring(0, 50),
        }))
      : [
          {
            id: 'PL-ITEM-ALL',
            price: grossAmount,
            quantity: 1,
            name: 'Pesanan Puthu Lanang Malang',
          },
        ];

  // Batasi metode pembayaran sesuai pilihan user (QRIS atau Transfer Bank)
  let enabledPayments: string[] | undefined;
  if (paymentMethod === 'qris') {
    enabledPayments = ['gopay', 'shopeepay', 'other_qris'];
  } else if (paymentMethod === 'transfer') {
    enabledPayments = ['bca_va', 'bni_va', 'bri_va', 'permata_va', 'echannel', 'other_va'];
  }

  // Anti-redirect ke example.com dengan mengarahkan callback finish ke aplikasi mobile
  const mobileBase = (
    env.MOBILE_APP_URL ||
    process.env.CLIENT_URL ||
    'https://puthu-lanang-mobile.vercel.app'
  ).replace(/\/+$/, '');
  const finishCallbackUrl = mobileBase.endsWith('/payment-finish')
    ? mobileBase
    : `${mobileBase}/payment-finish`;

  const parameter: Record<string, any> = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    customer_details: {
      first_name: customerName || 'Pelanggan Puthu Lanang',
      phone: customerPhone || '088212383828',
    },
    item_details: formattedItems,
    callbacks: {
      finish: finishCallbackUrl,
    },
  };

  if (enabledPayments) {
    parameter.enabled_payments = enabledPayments;
  }

  try {
    const transaction = await snap.createTransaction(parameter);
    logger.info(
      { orderId, token: transaction.token },
      'Midtrans Snap transaction berhasil dibuat (Sandbox)'
    );

    return {
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    };
  } catch (error: any) {
    logger.error(
      { err: error?.message || error, orderId },
      'Gagal memanggil Midtrans Snap SDK'
    );

    // Fallback development jika Server Key Sandbox belum diisi / expired
    if (env.DEV_MODE) {
      const mockToken = `snap-token-sandbox-${Date.now()}`;
      const mockUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${mockToken}`;
      logger.warn(
        { mockUrl },
        'Dev Mode: Menggunakan simulasi Midtrans Snap URL karena kredensial sandbox belum terdaftar di dashboard.'
      );
      return {
        token: mockToken,
        redirect_url: mockUrl,
      };
    }

    throw new Error(`Midtrans Error: ${error?.message || 'Gagal membuat sesi pembayaran'}`);
  }
}

