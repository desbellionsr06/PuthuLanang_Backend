export type UserRole = 'admin' | 'user';

export interface UserSchema {
  id: string;
  nama: string;
  no_whatsapp: string;
  password: string;
  role: UserRole;
  createdAt: string;
}
