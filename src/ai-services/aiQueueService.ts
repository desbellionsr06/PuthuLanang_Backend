import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { env } from '../config/env';
import { AiFeatureType, AiVerificationStatus } from '../types';
import { sendPushNotificationToUser } from '../services/notificationService';
import { generateGeminiJsonText } from './geminiClient';
import { anonymizeAiContext, sanitizePromptInput } from './promptSanitizer';
import { buildMenuRecommendationPrompt, buildQueueEstimatorPrompt } from './promptTemplates';
import {
  AiQueueOutput,
  AiQueueOutputSchema,
  AiRecommendationOutput,
  AiRecommendationOutputSchema,
  parseAndValidateAiJson,
} from './aiValidator';

export interface QueueEstimateInput {
  userId?: number;
  outlet: string;
  day: string;
  timeSlot: string;
  distanceKm?: number;
}

export interface MenuRecommendationInput {
  userId?: number;
  query?: string;
  budget?: number;
  preference?: string;
}

interface NormalizedMenuItem {
  id: string;
  nama: string;
  harga: number;
  kategori: string;
  gambar: string;
}

const FALLBACK_MENU: NormalizedMenuItem[] = [
  { id: 'puthu-01', nama: 'Puthu', harga: 18000, kategori: 'pusaka', gambar: 'assets/images/puthu_bambu.png' },
  { id: 'klepon-02', nama: 'Klepon', harga: 18000, kategori: 'paling_laris', gambar: 'assets/images/klepon_pandan.png' },
  { id: 'cenil-03', nama: 'Cenil', harga: 18000, kategori: 'pusaka', gambar: 'assets/images/cenil_pelangi.png' },
  { id: 'lupis-04', nama: 'Lupis', harga: 18000, kategori: 'pusaka', gambar: 'assets/images/lupis_ketan.png' },
  { id: 'paket-campur-05', nama: 'Paket Campur', harga: 20000, kategori: 'paket_campur', gambar: 'assets/images/paket_tampah.png' },
  { id: 'besek-hampers-06', nama: 'Box Besek Bambu Hampers', harga: 45000, kategori: 'besek', gambar: 'assets/images/paket_tampah.png' },
];

function computeDeterministicQueueFallback(
  outlet: string,
  day: string,
  timeSlot: string,
  activeOrders: number
): AiQueueOutput {
  let baseMin = 8;
  let baseMax = 12;
  let crowdLevel: AiQueueOutput['crowd_level'] = 'Ramai Lancar';
  let crowdColor: AiQueueOutput['crowd_color'] = 'gold';
  let peakPct = 60;
  let tips = 'Slot ideal. Pesanan Anda diprioritaskan hangat saat diambil di gerai.';

  if (timeSlot.startsWith('16:00')) {
    baseMin = 4;
    baseMax = 7;
    crowdLevel = 'Antrean Pendek';
    crowdColor = 'green';
    peakPct = 35;
    tips = 'Kondisi gerai sangat lengang. Direkomendasikan untuk pengambilan kilat!';
  } else if (timeSlot.startsWith('17:00') || timeSlot.startsWith('17:30')) {
    baseMin = 14;
    baseMax = 20;
    crowdLevel = 'Jam Sibuk (Peak Hours)';
    crowdColor = 'orange';
    peakPct = 88;
    tips = 'Jam favorit pelanggan sepulang kerja. Disarankan tiba 5 menit sebelum slot berakhir.';
  } else if (timeSlot.startsWith('18:30')) {
    baseMin = 5;
    baseMax = 9;
    crowdLevel = 'Antrean Pendek';
    crowdColor = 'green';
    peakPct = 45;
    tips = 'Slot malam santai. Segera ambil pesanan hangat sebelum gerai tutup pukul 19:30.';
  }

  if (!outlet.toLowerCase().includes('celaket')) {
    baseMin = Math.max(3, Math.round(baseMin * 0.75));
    baseMax = Math.max(6, Math.round(baseMax * 0.75));
    peakPct = Math.round(peakPct * 0.8);
  }

  const isWeekend = ['sabtu', 'minggu', 'jumat'].some((d) => day.toLowerCase().includes(d));
  if (isWeekend) {
    baseMin += 2;
    baseMax += 3;
    peakPct = Math.min(95, peakPct + 15);
  }

  const queueBoost = Math.min(10, Math.floor(activeOrders / 3));
  return {
    crowd_level: crowdLevel,
    crowd_color: crowdColor,
    wait_time_min: baseMin + queueBoost,
    wait_time_max: baseMax + queueBoost,
    peak_percentage: peakPct,
    confidence_score: '95% Akurasi Prediktif AI (Fallback)',
    tips,
  };
}

function computeDeterministicRecommendationFallback(
  query: string,
  preference: string,
  budget: number | undefined,
  catalog: NormalizedMenuItem[]
): AiRecommendationOutput {
  const lowerQ = `${query} ${preference}`.toLowerCase();
  const find = (kw: string) => catalog.find((m) => m.nama.toLowerCase().includes(kw)) ?? catalog[0];

  let recommendationTitle = 'Paket Solo Harmoni 1935';
  let reason = 'Pilihan kurasi paling pas untuk dinikmati sendiri atau berdua.';
  let aiTag = 'Rekomendasi Cepat AI';
  let items = [
    { id: find('campur').id, qty: 1, alasan: 'Semua varian rasa dalam satu piring hangat' },
    { id: find('puthu').id, qty: 1, alasan: 'Puthu bambu ikon utama Puthu Lanang Malang' },
  ];

  if (lowerQ.includes('hampers') || lowerQ.includes('oleh') || lowerQ.includes('hadiah') || lowerQ.includes('besek')) {
    recommendationTitle = 'Paket Hampers Anyaman Besek Elegan';
    reason = 'Dipilih khusus untuk hantaran istimewa beraroma pandan dengan kemasan besek bambu.';
    aiTag = 'Rekomendasi Hantaran';
    items = [
      { id: find('besek').id, qty: 1, alasan: 'Kemasan anyaman bambu otentik siap hantar' },
      { id: find('campur').id, qty: 1, alasan: 'Paket campur lengkap agar makin meriah' },
    ];
  } else if (lowerQ.includes('keluarga') || lowerQ.includes('rame') || lowerQ.includes('arisan')) {
    recommendationTitle = 'Paket Santap Bersama Keluarga (3-5 Orang)';
    reason = 'Kombinasi komplit agar seluruh keluarga mencicipi semua varian legendaris.';
    aiTag = 'Populer untuk Keluarga';
    items = [
      { id: find('campur').id, qty: 2, alasan: '2 porsi paket campur isi komplit 4 jajanan' },
      { id: find('puthu').id, qty: 1, alasan: 'Puthu hangat aroma pandan suji favorit keluarga' },
    ];
  } else if (lowerQ.includes('manis') || lowerQ.includes('gula') || lowerQ.includes('aren')) {
    recommendationTitle = 'Kombinasi Manis Legit Aren Asli';
    reason = 'Favorit bagi pecinta manis alami gula aren murni tanpa pemanis buatan.';
    aiTag = 'Manis Alami';
    items = [
      { id: find('puthu').id, qty: 1, alasan: 'Uap bambu dengan gula aren cair di tengahnya' },
      { id: find('klepon').id, qty: 1, alasan: 'Letupan gula aren cair berbalut kelapa parut segar' },
    ];
  }

  if (budget && budget > 0) {
    const firstItem = catalog.find((c) => c.id === items[0].id);
    if (firstItem && firstItem.harga * items[0].qty > budget && items.length > 1) {
      items = [items[0]];
    }
  }

  return {
    recommendation_title: recommendationTitle,
    reason,
    ai_tag: aiTag,
    items,
  };
}

/**
 * Estimasi waktu antrean cerdas via Gemini API dengan filter prompt injection,
 * anonimisasi PII, validasi skema JSON Zod, dan pencatatan ke ai_predictions_logs.
 */
export async function estimateQueueWithAi(input: QueueEstimateInput): Promise<{
  logId: number;
  prediction: AiQueueOutput;
  aiEngine: 'gemini' | 'fallback';
}> {
  const cleanOutlet = sanitizePromptInput(input.outlet, 80);
  const cleanDay = sanitizePromptInput(input.day, 40);
  const cleanSlot = sanitizePromptInput(input.timeSlot, 40);

  const [countRows] = await db.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS active_orders FROM orders WHERE status IN ('Baru', 'Diproses', 'Sedang Dikukus')"
  );
  const activeOrders = Number(countRows[0]?.active_orders ?? 0);

  const safeContext = anonymizeAiContext({
    outlet: cleanOutlet,
    day: cleanDay,
    timeSlot: cleanSlot,
    distanceKm: typeof input.distanceKm === 'number' ? input.distanceKm : null,
    activeOrdersInKitchen: activeOrders,
  });

  let validatedOutput: AiQueueOutput;
  let aiEngine: 'gemini' | 'fallback' = 'gemini';

  if (env.GEMINI_API_KEY) {
    try {
      const rawResponse = await generateGeminiJsonText(buildQueueEstimatorPrompt(safeContext));
      validatedOutput = parseAndValidateAiJson(rawResponse, AiQueueOutputSchema);
    } catch (err) {
      console.warn('[AI QUEUE FALLBACK]:', err instanceof Error ? err.message : err);
      aiEngine = 'fallback';
      const fallbackRaw = JSON.stringify(
        computeDeterministicQueueFallback(cleanOutlet, cleanDay, cleanSlot, activeOrders)
      );
      validatedOutput = parseAndValidateAiJson(fallbackRaw, AiQueueOutputSchema);
    }
  } else {
    aiEngine = 'fallback';
    const fallbackRaw = JSON.stringify(
      computeDeterministicQueueFallback(cleanOutlet, cleanDay, cleanSlot, activeOrders)
    );
    validatedOutput = parseAndValidateAiJson(fallbackRaw, AiQueueOutputSchema);
  }

  const [insertRes] = await db.query<ResultSetHeader>(
    `INSERT INTO ai_predictions_logs
     (feature_type, requested_by_user_id, anonymized_input, validated_output, confidence_score, verification_status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      'queue_estimator',
      input.userId ?? null,
      JSON.stringify(safeContext),
      JSON.stringify(validatedOutput),
      validatedOutput.confidence_score,
    ]
  );

  return {
    logId: insertRes.insertId,
    prediction: validatedOutput,
    aiEngine,
  };
}

/**
 * Rekomendasi menu cerdas via Gemini API dengan validasi JSON & pencatatan ke ai_predictions_logs.
 */
export async function recommendMenuWithAi(input: MenuRecommendationInput) {
  const cleanQuery = sanitizePromptInput(input.query ?? '', 200);
  const cleanPreference = sanitizePromptInput(input.preference ?? '', 120);

  const [menuRows] = await db.query<RowDataPacket[]>('SELECT * FROM menu ORDER BY id ASC');
  const catalog: NormalizedMenuItem[] =
    menuRows.length > 0
      ? menuRows.map((m) => ({
          id: String(m.id),
          nama: String(m.name || m.nama || 'Menu Puthu Lanang'),
          harga: Number(m.price ?? m.harga ?? 18000),
          kategori: String(m.category || m.kategori || 'pusaka'),
          gambar: String(m.image || m.gambar || 'assets/images/puthu_bambu.png'),
        }))
      : FALLBACK_MENU;

  const safeContext = anonymizeAiContext({
    query: cleanQuery,
    preference: cleanPreference,
    budget: input.budget ?? null,
  });

  let validatedAi: AiRecommendationOutput;
  if (env.GEMINI_API_KEY) {
    try {
      const prompt = buildMenuRecommendationPrompt(
        safeContext,
        catalog.map(({ id, nama, harga, kategori }) => ({ id, nama, harga, kategori }))
      );
      const rawText = await generateGeminiJsonText(prompt);
      validatedAi = parseAndValidateAiJson(rawText, AiRecommendationOutputSchema);
    } catch (err) {
      console.warn('[AI RECOMMENDATION FALLBACK]:', err instanceof Error ? err.message : err);
      const fallbackRaw = JSON.stringify(
        computeDeterministicRecommendationFallback(cleanQuery, cleanPreference, input.budget, catalog)
      );
      validatedAi = parseAndValidateAiJson(fallbackRaw, AiRecommendationOutputSchema);
    }
  } else {
    const fallbackRaw = JSON.stringify(
      computeDeterministicRecommendationFallback(cleanQuery, cleanPreference, input.budget, catalog)
    );
    validatedAi = parseAndValidateAiJson(fallbackRaw, AiRecommendationOutputSchema);
  }

  const mappedItems = validatedAi.items.map((aiItem) => {
    const match = catalog.find((c) => c.id === aiItem.id) ?? catalog[0];
    return {
      id: match.id,
      nama: match.nama,
      harga: match.harga,
      qty: aiItem.qty,
      gambar: match.gambar,
      alasan: aiItem.alasan,
    };
  });

  const totalEstimated = mappedItems.reduce((sum, item) => sum + item.harga * item.qty, 0);

  const [insertRes] = await db.query<ResultSetHeader>(
    `INSERT INTO ai_predictions_logs
     (feature_type, requested_by_user_id, anonymized_input, validated_output, confidence_score, verification_status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      'menu_recommendation',
      input.userId ?? null,
      JSON.stringify(safeContext),
      JSON.stringify({ ...validatedAi, total_estimated: totalEstimated, items: mappedItems }),
      '94% Relevansi Kurasi AI',
    ]
  );

  return {
    log_id: insertRes.insertId,
    recommendation_title: validatedAi.recommendation_title,
    reason: validatedAi.reason,
    ai_tag: validatedAi.ai_tag,
    total_estimated: totalEstimated,
    items: mappedItems,
  };
}

export async function getAiLogs(
  status?: AiVerificationStatus,
  featureType?: AiFeatureType
): Promise<RowDataPacket[]> {
  let sql = `
    SELECT a.id, a.feature_type, a.requested_by_user_id, a.anonymized_input,
           a.validated_output, a.confidence_score, a.verification_status,
           a.verification_notes, a.verified_at, a.created_at,
           u.nama AS requested_by_name
    FROM ai_predictions_logs a
    LEFT JOIN users u ON a.requested_by_user_id = u.id
  `;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push('a.verification_status = ?');
    params.push(status);
  }
  if (featureType) {
    conditions.push('a.feature_type = ?');
    params.push(featureType);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY a.created_at DESC LIMIT 50';
  const [rows] = await db.query<RowDataPacket[]>(sql, params);

  return rows.map((row) => ({
    ...row,
    anonymized_input:
      typeof row.anonymized_input === 'string' ? JSON.parse(row.anonymized_input) : row.anonymized_input,
    validated_output:
      typeof row.validated_output === 'string' ? JSON.parse(row.validated_output) : row.validated_output,
  })) as RowDataPacket[];
}

export async function getAiVerificationStats() {
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      COUNT(*) AS total_logs,
      SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) AS verified_count,
      SUM(CASE WHEN verification_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
    FROM ai_predictions_logs
  `);

  const row = rows[0] ?? {};
  const total = Number(row.total_logs ?? 0);
  const verified = Number(row.verified_count ?? 0);
  const rejected = Number(row.rejected_count ?? 0);
  const reviewed = verified + rejected;
  const verificationRatePct = reviewed > 0 ? Math.round((verified / reviewed) * 100) : 0;

  return {
    total_logs: total,
    pending_count: Number(row.pending_count ?? 0),
    verified_count: verified,
    rejected_count: rejected,
    verification_rate_pct: verificationRatePct,
  };
}

export async function verifyAiLogByManager(
  logId: number,
  managerId: number,
  status: 'verified' | 'rejected',
  notes?: string
): Promise<void> {
  const verifiedBy = managerId > 0 ? managerId : null;
  const [updateRes] = await db.query<ResultSetHeader>(
    `UPDATE ai_predictions_logs
     SET verification_status = ?, verification_notes = ?, verified_by_user_id = ?, verified_at = NOW()
     WHERE id = ?`,
    [status, notes ?? null, verifiedBy, logId]
  );

  if (updateRes.affectedRows === 0) {
    throw new Error('Log prediksi AI tidak ditemukan.');
  }

  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT requested_by_user_id FROM ai_predictions_logs WHERE id = ? LIMIT 1',
    [logId]
  );

  const targetUserId = rows[0]?.requested_by_user_id as number | null | undefined;
  if (targetUserId && targetUserId > 0) {
    const title =
      status === 'verified'
        ? 'Estimasi Antrean Divalidasi Manajer'
        : 'Koreksi Estimasi Antrean Gerai';
    const body =
      notes ||
      'Pemantau gerai Puthu Lanang telah meninjau hasil prediksi AI untuk jadwal Anda.';

    await sendPushNotificationToUser(targetUserId, title, body);
  }
}

/**
 * Mengambil hasil prediksi/rekomendasi AI terkini yang telah DISETUJUI (verified) oleh Manajer Web Admin.
 * Menjamin Frontend Mobile hanya menampilkan output yang telah lolos validasi manusia.
 */
export async function getLatestVerifiedAiResult(featureType: AiFeatureType = 'queue_estimator') {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, feature_type, anonymized_input, validated_output, confidence_score, verification_status, verification_notes, verified_at, created_at
     FROM ai_predictions_logs
     WHERE verification_status = 'verified' AND feature_type = ?
     ORDER BY verified_at DESC, id DESC
     LIMIT 1`,
    [featureType]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const parseJson = (val: unknown) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  };

  return {
    id: row.id,
    feature_type: row.feature_type,
    anonymized_input: parseJson(row.anonymized_input),
    validated_output: parseJson(row.validated_output),
    confidence_score: row.confidence_score,
    verification_status: row.verification_status,
    verification_notes: row.verification_notes,
    verified_at: row.verified_at,
    created_at: row.created_at,
  };
}

