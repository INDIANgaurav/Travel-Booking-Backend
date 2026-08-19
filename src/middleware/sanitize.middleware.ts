import { Request, Response, NextFunction } from 'express';

const sanitizeObject = (obj: any) => {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return;
  }
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key.startsWith('$')) {
        delete obj[key];
      } else {
        sanitizeObject(obj[key]);
      }
    }
  }
};

export const mongoSanitize = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body) sanitizeObject(req.body);
    if (req.query) sanitizeObject(req.query);
    if (req.params) sanitizeObject(req.params);
  } catch (error) {
    console.error('Sanitization Error:', error);
  }
  next();
};
