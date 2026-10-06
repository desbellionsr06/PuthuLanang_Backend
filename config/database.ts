/**
 * Database & Environment Configuration Module
 */

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  clientOrigin: string;
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'puthu_lanang_celaket_secret_key_1935',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
};

export class DatabaseConnection {
  private static isConnected: boolean = false;

  public static async connect(): Promise<void> {
    try {
      // Inisialisasi koneksi data store (In-memory persistent store)
      this.isConnected = true;
      console.log(`[Database] Terkoneksi ke Puthu Lanang Data Store (${config.nodeEnv} mode)`);
    } catch (error) {
      this.isConnected = false;
      console.error('[Database] Gagal menginisialisasi koneksi database:', error);
      throw error;
    }
  }

  public static getStatus(): boolean {
    return this.isConnected;
  }
}
