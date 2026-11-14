import { createMidtransTransaction } from './midtransService';

/**
 * Kompatibilitas dengan rute /api/payment/create-charge
 */
export async function createMidtransSnapCharge(input: {
  gross_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  payment_method?: string;
}): Promise<{ redirect_url: string; token: string }> {
  const amount = input.gross_amount || 18000;
  const orderId = `PL-TRX-${Date.now()}`;

  return createMidtransTransaction({
    orderId,
    grossAmount: amount,
    customerName: input.customer_name,
    customerPhone: input.customer_phone,
    paymentMethod: input.payment_method,
  });
}
