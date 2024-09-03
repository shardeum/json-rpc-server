import { Request, Response, NextFunction } from 'express';
import { methods } from '../api';

const allowedMethods = Object.keys(methods);

export const methodWhitelist = (req: Request, res: Response, next: NextFunction) => {
  const method = req.body?.method;
  if (method && allowedMethods.includes(method)) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden' });
};
