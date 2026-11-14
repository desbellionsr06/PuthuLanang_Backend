// src/services/whatsapp.service.ts
import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface FonnteSendResponse {
  status: boolean;
  target?: string[];
  id?: string[];
  message?: string;
  reason?: string;
  process?: string;
}

/**
 * Mengirim pesan WhatsApp melalui gateway Fonnte API.
 * Digunakan untuk pengiriman kode verifikasi OTP, status pesanan, dan konfirmasi tiket.
 *
 * @param targetNumber Nomor WhatsApp tujuan (contoh: '08123456789' atau '628123456789')
 * @param message Teks pesan yang akan dikirim
 * @returns Data response dari API Fonnte
 */
export const sendWhatsAppMessage = async (
  targetNumber: string,
  message: string
): Promise<FonnteSendResponse> => {
  const token = (process.env.FONNTE_TOKEN || env.FONNTE_TOKEN || '').trim();

  // Bersihkan karakter non-digit dari nomor telepon
  const cleanPhone = targetNumber.replace(/[^\d+]/g, '').trim();
  if (!cleanPhone) {
    throw new Error('Nomor WhatsApp tujuan tidak valid.');
  }

  // Jika token belum diset dan sedang di mode development, catat log aman tanpa crash
  if (!token || token === 'isi_token_fonnte_anda') {
    if (env.DEV_MODE) {
      logger.warn(
        { target: cleanPhone },
        '[FONNTE DEV] FONNTE_TOKEN belum diatur di .env. Pesan WhatsApp disimulasikan terkirim.'
      );
      return {
        status: true,
        message: 'Mode simulasi development aktif (token Fonnte belum diatur).',
      };
    }
    throw new Error('Konfigurasi FONNTE_TOKEN belum diatur di server backend.');
  }

  try {
    const response = await axios.post<FonnteSendResponse>(
      'https://api.fonnte.com/send',
      {
        target: cleanPhone,
        message: message,
        countryCode: '62',
      },
      {
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    // Fonnte bisa mengembalikan HTTP 200 tetapi status: false di JSON body
    if (response.data && response.data.status === false) {
      const reason = response.data.reason || response.data.message || 'Ditolak oleh gateway Fonnte';
      logger.error({ target: cleanPhone, reason }, 'Gagal mengirim pesan via Fonnte.');
      throw new Error(`Pengiriman WhatsApp gagal: ${reason}`);
    }

    logger.info({ target: cleanPhone }, 'Pesan WhatsApp berhasil dikirim via Fonnte.');
    return response.data;
  } catch (error: any) {
    const errMsg =
      error?.response?.data?.reason ||
      error?.response?.data?.message ||
      error?.message ||
      'Gagal menghubungi server WhatsApp Fonnte';

    logger.error({ target: cleanPhone, err: errMsg }, 'Error API Fonnte');

    // Jika di dev mode, jangan blokir alur registrasi jika Fonnte bermasalah
    if (env.DEV_MODE) {
      logger.warn('Dev Mode: Melewati error Fonnte agar alur demo tetap dapat dilanjutkan.');
      return {
        status: false,
        message: `Dev Mode bypass: ${errMsg}`,
      };
    }

    throw new Error(`Gagal mengirim kode OTP melalui WhatsApp: ${errMsg}`);
  }
};
