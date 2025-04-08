import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { CONFIG } from '../config';

// Custom log levels
const levels = {
  critical: 0,
  error: 1,
  warn: 2,
  notice: 3,
  info: 4,
  debug: 5,
};

// Custom colors for console output
const colors = {
  critical: 'red',
  error: 'red',
  warn: 'yellow',
  notice: 'magenta',
  info: 'green',
  debug: 'blue',
};

// Add colors to Winston
winston.addColors(colors);

// Custom format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label']
  }),
  winston.format.json()
);

// Console format (more readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message, ...metadata } = info;
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Get log level from environment variable or config
const getLogLevel = (): string => {
  // Priority: 1. Environment variable, 2. Config setting, 3. Default
  return process.env.LOG_LEVEL || 
         (CONFIG.logLevel ? CONFIG.logLevel : 'info');
};

// Create the logger
const logger = winston.createLogger({
  levels,
  format: logFormat,
  defaultMeta: { service: 'json-rpc-server' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      level: getLogLevel(),
    }),
    
    // File transport for errors and above
    new winston.transports.DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    
    // File transport for all logs
    new winston.transports.DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

// Create a stream object for Morgan integration
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

export default logger; 