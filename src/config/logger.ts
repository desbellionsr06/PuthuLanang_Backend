import { randomUUID } from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.no_whatsapp',
      'req.body.otp_code',
      'password',
      'token',
      'jwt_token',
    ],
    censor: '[TEREKSI / REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', existing);
    return existing;
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

