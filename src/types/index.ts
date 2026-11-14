import { Request } from 'express';

export type UserRole = 'owner' | 'cashier' | 'customer' | 'manager';

export interface JwtUserPayload {
  id: number;
  no_whatsapp: string;
  nama: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}

export type AiFeatureType = 'queue_estimator' | 'menu_recommendation';
export type AiVerificationStatus = 'pending' | 'verified' | 'rejected';
