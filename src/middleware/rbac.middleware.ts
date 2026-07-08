import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `User role ${req.user ? req.user.role : 'Unknown'} is not authorized to access this route`,
      });
    }
    next();
  };
};

export const authorizeDepartments = (...departments: (string | null)[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }
    
    if (req.user.role !== 'SUB_ADMIN' || !departments.includes(req.user.department)) {
      return res.status(403).json({
        message: `User department ${req.user.department || 'None'} is not authorized to access this route`,
      });
    }
    next();
  };
};
