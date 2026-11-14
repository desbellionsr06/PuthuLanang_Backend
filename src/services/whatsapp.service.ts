// src/services/whatsapp.service.ts
import axios from 'axios';

export const sendWhatsAppMessage = async (targetNumber: string, message: string) => {
    try {
        const response = await axios.post(
            'https://api.fonnte.com/send',
            {
                target: targetNumber, // Nomor HP tujuan dari input user mobile
                message: message,     // Teks pesan berisi OTP
            },
            {
                headers: {
                    // Mengambil FONNTE_TOKEN dari file .env
                    Authorization: process.env.FONNTE_TOKEN,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Gagal mengirim WhatsApp:', error);
        throw new Error('Gagal mengirim kode OTP');
    }
};