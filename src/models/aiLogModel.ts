import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import { AiFeatureType, AiVerificationStatus } from '../types';

export interface AiLogDbRow extends RowDataPacket {
  id: number;
  feature_type: AiFeatureType;
  requested_by_user_id: number | null;
  requested_by_name?: string | null;
  anonymized_input: string | Record<string, unknown>;
  validated_output: string | Record<string, unknown>;
  confidence_score: string | null;
  verification_status: AiVerificationStatus;
  verified_by_user_id: number | null;
  verified_by_name?: string | null;
  verification_notes: string | null;
  verified_at: string | null;
  created_at: string;
}

export async function createAiLogInDb(data: {
  featureType: AiFeatureType;
  userId?: number;
  anonymizedInput: Record<string, unknown>;
  validatedOutput: Record<string, unknown>;
  confidenceScore?: string;
  verificationStatus?: AiVerificationStatus;
}): Promise<number> {
  const [insertRes] = await db.query<ResultSetHeader>(
    `INSERT INTO ai_predictions_logs
       (feature_type, requested_by_user_id, anonymized_input, validated_output, confidence_score, verification_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.featureType,
      data.userId || null,
      JSON.stringify(data.anonymizedInput),
      JSON.stringify(data.validatedOutput),
      data.confidenceScore || null,
      data.verificationStatus || 'pending',
    ]
  );
  return insertRes.insertId;
}

export async function updateAiLogStatusInDb(
  logId: number,
  managerUserId: number,
  status: AiVerificationStatus,
  notes?: string
): Promise<boolean> {
  const [updateRes] = await db.query<ResultSetHeader>(
    `UPDATE ai_predictions_logs
     SET verification_status = ?,
         verified_by_user_id = ?,
         verification_notes = ?,
         verified_at = NOW()
     WHERE id = ?`,
    [status, managerUserId, notes || null, logId]
  );
  return updateRes.affectedRows > 0;
}

export async function findAiLogByIdFromDb(logId: number): Promise<AiLogDbRow | null> {
  const [rows] = await db.query<AiLogDbRow[]>(
    'SELECT * FROM ai_predictions_logs WHERE id = ? LIMIT 1',
    [logId]
  );
  return rows[0] || null;
}

export async function findAiLogsFromDb(
  status?: AiVerificationStatus,
  featureType?: AiFeatureType
): Promise<AiLogDbRow[]> {
  let sql = `
    SELECT
      l.id,
      l.feature_type,
      l.requested_by_user_id,
      u.nama AS requested_by_name,
      l.anonymized_input,
      l.validated_output,
      l.confidence_score,
      l.verification_status,
      v.nama AS verified_by_name,
      l.verification_notes,
      l.verified_at,
      l.created_at
    FROM ai_predictions_logs l
    LEFT JOIN users u ON l.requested_by_user_id = u.id
    LEFT JOIN users v ON l.verified_by_user_id = v.id
  `;

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (status) {
    whereClauses.push('l.verification_status = ?');
    params.push(status);
  }
  if (featureType) {
    whereClauses.push('l.feature_type = ?');
    params.push(featureType);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ' ORDER BY l.created_at DESC, l.id DESC LIMIT 100';

  const [rows] = await db.query<AiLogDbRow[]>(sql, params);
  return rows;
}

export async function findLatestVerifiedAiFromDb(
  featureType: AiFeatureType
): Promise<AiLogDbRow | null> {
  const [rows] = await db.query<AiLogDbRow[]>(
    `SELECT * FROM ai_predictions_logs
     WHERE feature_type = ? AND verification_status = 'verified'
     ORDER BY verified_at DESC, id DESC
     LIMIT 1`,
    [featureType]
  );
  return rows[0] || null;
}

export async function getAiLogStatsFromDb() {
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      COUNT(*) AS total_logs,
      SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) AS verified_count,
      SUM(CASE WHEN verification_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
    FROM ai_predictions_logs
  `);

  const total = Number(rows[0]?.total_logs ?? 0);
  const pending = Number(rows[0]?.pending_count ?? 0);
  const verified = Number(rows[0]?.verified_count ?? 0);
  const rejected = Number(rows[0]?.rejected_count ?? 0);
  const rate = total > 0 ? Math.round(((verified + rejected) / total) * 100) : 0;

  return {
    total_logs: total,
    pending_count: pending,
    verified_count: verified,
    rejected_count: rejected,
    verification_rate_pct: rate,
  };
}

