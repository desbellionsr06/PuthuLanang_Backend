declare module 'midtrans-client' {
  export interface SnapOptions {
    isProduction?: boolean;
    serverKey: string;
    clientKey?: string;
  }

  export interface SnapTransactionResponse {
    token: string;
    redirect_url: string;
    [key: string]: any;
  }

  export class Snap {
    constructor(options: SnapOptions);
    createTransaction(parameter: Record<string, any>): Promise<SnapTransactionResponse>;
    createTransactionToken(parameter: Record<string, any>): Promise<string>;
    createTransactionRedirectUrl(parameter: Record<string, any>): Promise<string>;
    transaction: {
      status(orderId: string): Promise<any>;
      approve(orderId: string): Promise<any>;
      cancel(orderId: string): Promise<any>;
      expire(orderId: string): Promise<any>;
      refund(orderId: string, parameter?: any): Promise<any>;
    };
  }

  export class CoreApi {
    constructor(options: SnapOptions);
    charge(parameter: Record<string, any>): Promise<any>;
  }
}

