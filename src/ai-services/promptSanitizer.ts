const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i,
  /forget\s+(everything|all\s+rules)/i,
  /system\s*:\s*/i,
  /you\s+are\s+now\s+/i,
  /act\s+as\s+(a\s+)?(hacker|admin|root|developer)/i,
  /bypass\s+(security|rules|constraints|validation)/i,
  /reveal\s+(system\s+prompt|api\s*key|secret|password)/i,
  /<\s*script[^>]*>/i,
];

/**
 * Menyaring input pengguna dari pola Prompt Injection dan karakter pemecah struktur prompt.
 */
export function sanitizePromptInput(rawInput: string, maxLength = 300): string {
  const normalized = (rawInput || '').trim().slice(0, maxLength);

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new Error('Input ditolak oleh filter keamanan (terindikasi Prompt Injection).');
    }
  }

  return normalized.replace(/[`{}[\]<>]/g, '');
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
}

/**
 * Menyamarkan PII (nomor WhatsApp, nama lengkap, dan ID database) sebelum konteks masuk ke prompt AI.
 */
export function anonymizeAiContext(payload: Record<string, unknown>): Record<string, unknown> {
  const safeCopy: Record<string, unknown> = { ...payload };

  delete safeCopy.id;
  delete safeCopy.user_id;
  delete safeCopy.userId;

  if (typeof safeCopy.nama === 'string') {
    safeCopy.nama = 'Pelanggan_Anonim';
  }
  if (typeof safeCopy.no_whatsapp === 'string') {
    safeCopy.no_whatsapp = maskPhone(safeCopy.no_whatsapp);
  }
  if (typeof safeCopy.phone === 'string') {
    safeCopy.phone = maskPhone(safeCopy.phone);
  }

  return safeCopy;
}

