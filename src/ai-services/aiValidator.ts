import { z } from 'zod';

export const AiQueueOutputSchema = z
  .object({
    crowd_level: z.enum(['Antrean Pendek', 'Ramai Lancar', 'Jam Sibuk (Peak Hours)']),
    crowd_color: z.enum(['green', 'gold', 'orange']),
    wait_time_min: z.number().int().min(1).max(120),
    wait_time_max: z.number().int().min(2).max(180),
    peak_percentage: z.number().int().min(0).max(100),
    confidence_score: z.string().min(3).max(60),
    tips: z.string().min(10).max(250),
  })
  .refine((v) => v.wait_time_max >= v.wait_time_min, {
    message: 'wait_time_max tidak boleh lebih kecil dari wait_time_min',
  });

export type AiQueueOutput = z.infer<typeof AiQueueOutputSchema>;

export const AiRecommendationOutputSchema = z.object({
  recommendation_title: z.string().min(3).max(120),
  reason: z.string().min(10).max(260),
  ai_tag: z.string().min(3).max(60),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        qty: z.number().int().min(1).max(20),
        alasan: z.string().min(5).max(180),
      })
    )
    .min(1)
    .max(6),
});

export type AiRecommendationOutput = z.infer<typeof AiRecommendationOutputSchema>;

/**
 * Membersihkan pembungkus markdown dan memvalidasi JSON terhadap skema Zod sebelum masuk database.
 */
export function parseAndValidateAiJson<T>(rawText: string, schema: z.ZodSchema<T>): T {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Keluaran AI bukan format JSON yang valid.');
  }

  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    throw new Error(`Validasi skema JSON AI gagal (${issue.path.join('.')}): ${issue.message}`);
  }

  return validation.data;
}

