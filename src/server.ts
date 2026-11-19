import express from 'express';
import http from 'http';
import { initSocket } from './config/socket';
import dotenv from 'dotenv';
dotenv.config();
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import crypto from 'crypto';
import connectDB from './config/db';
import './config/firebase-admin';
import { mongoSanitize } from './middleware/sanitize.middleware';
import { startCronJobs } from './cron';

import authRoutes from './modules/auth/auth.routes';
import adminRoutes from './modules/users/admin.routes';
import userRoutes from './modules/users/user.routes';
import agentRoutes from './modules/agents/agent.routes';
import tourRoutes from './modules/tours/tour.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import searchRoutes from './modules/searches/search.routes';
import bookingRoutes from './modules/bookings/booking.routes';
import cmsRoutes from './modules/cms/cms.routes';
import hotelRoutes from './modules/hotels/hotel.routes';
import seriesFareRoutes from './modules/seriesFare/seriesFare.routes';
import markupRoutes from './modules/agents/markup.routes';
import b2bOfflineBookingRoutes from './modules/bookings/offlineBooking.routes';
import manageBookingRoutes from './modules/bookings/manageBooking.routes';
import gstInvoiceRoutes from './modules/wallet/gstInvoice.routes';
import debitNoteRoutes from './modules/wallet/debitNote.routes';
import bankDetailsRoutes from './modules/agents/bankDetails.routes';
import paxCalendarRoutes from './modules/bookings/paxCalendar.routes';
import invoiceRoutes from './modules/bookings/invoice.routes';
import creditNoteRoutes from './modules/wallet/creditNote.routes';
import accountStatementRoutes from './modules/wallet/accountStatement.routes';
import aiRoutes from './modules/ai/ai.routes';
import supplierRoutes from './modules/supplier/supplier.routes';
import settingsRoutes from './modules/settings/settings.routes';
import reportRoutes from './modules/reports/reports.routes';
import financeRoutes from './modules/wallet/finance.routes';
import commissionRoutes from './modules/commissions/commission.routes';
import promoRoutes from './modules/promos/promo.routes';
import cancellationRoutes from './modules/bookings/cancellation.routes';
import ticketRoutes from './modules/tickets/ticket.routes';
import groupBookingRoutes from './modules/bookings/groupBooking.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import b2bApiRoutes from './modules/b2bApi/b2bApi.routes';
import b2bAdminRoutes from './modules/b2bApi/b2bAdmin.routes';
import festiveBannerRoutes from './modules/festiveBanners/festiveBanner.routes';
import webhookRoutes from './modules/payments/webhook.routes';
import { seedSuppliers } from './modules/supplier/supplier.service';

// Centralized Security & Environment Validator
const validateSecurityEnvironment = () => {
  const critical = [
    { name: 'JWT_SECRET', minLen: 8 },
    { name: 'MONGO_URI', minLen: 5 }
  ];

  for (const item of critical) {
    const val = process.env[item.name];
    if (!val || val.trim().length < item.minLen) {
      console.error(`FATAL CONFIGURATION ERROR: [${item.name}] environment variable is missing or insecure!`);
      process.exit(1);
    }
  }

  // Payment gateway health check
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.warn('⚠️ [PAYMENT GATEWAY CONFIG WARNING] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set in environment.');
  }

  // AirIQ health check
  if (!process.env.AIRIQ_API_KEY || !process.env.AIRIQ_USERNAME || !process.env.AIRIQ_PASSWORD) {
    console.warn('⚠️ [SUPPLIER CONFIG WARNING] AirIQ API credentials (AIRIQ_API_KEY, AIRIQ_USERNAME, AIRIQ_PASSWORD) missing in environment.');
  }
};
validateSecurityEnvironment();

connectDB().then(() => {
  seedSuppliers();
  startCronJobs();
});

const app = express();
app.set('trust proxy', 1); // Resolve real client IP behind Render/Nginx reverse proxies
const server = http.createServer(app);
initSocket(server);

app.use(express.json({ 
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Request Correlation ID Middleware for distributed tracing & log auditing
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  (req as any).id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// Security Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(mongoSanitize); // Custom middleware to prevent NoSQL Injection

app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'], // Allowing standard React/Vite ports
  credentials: true,
}));

app.get('/', (req, res) => {
  res.send('Travel Booking App API is running (TypeScript)... ');
});

// Production Health & Readiness Endpoints
app.get('/api/health', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'CONNECTED' : dbState === 2 ? 'CONNECTING' : 'DISCONNECTED';
  const memory = process.memoryUsage();

  const healthData = {
    status: dbState === 1 ? 'UP' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      host: mongoose.connection.host || 'unknown',
    },
    system: {
      heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
      rssMB: Math.round(memory.rss / 1024 / 1024),
    }
  };

  const statusCode = dbState === 1 ? 200 : 503;
  res.status(statusCode).json(healthData);
});

app.get('/api/health/ready', (_req, res) => {
  if (mongoose.connection.readyState === 1) {
    res.status(200).send('READY');
  } else {
    res.status(503).send('NOT_READY');
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  skip: (req) => req.originalUrl.startsWith('/api/v1/b2b') || req.originalUrl.startsWith('/api/webhooks') || req.originalUrl.startsWith('/api/health')
});
app.use('/api/', apiLimiter);

// Pre-DB Auth DDoS Shield (high IP ceiling avoids shared-Wi-Fi false positives; per-user locks live in auth.routes.ts)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts from this network. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/register-agent', authLimiter);
app.use('/api/auth/verify-registration', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// Webhook endpoints (raw-verified, idempotently handled)
app.use('/api/webhooks', webhookRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/admin/notifications', notificationRoutes);
app.use('/api/admin/b2b-clients', b2bAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/tours', tourRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/searches', searchRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/series-fare', seriesFareRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/group-bookings', groupBookingRoutes);

app.use('/api/markup', markupRoutes);
app.use('/api/offline-booking', b2bOfflineBookingRoutes);
app.use('/api/manage-bookings', manageBookingRoutes);
app.use('/api/gst-invoices', gstInvoiceRoutes);
app.use('/api/debit-notes', debitNoteRoutes);
app.use('/api/bank-details', bankDetailsRoutes);
app.use('/api/pax-calendar', paxCalendarRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
app.use('/api/account-statement', accountStatementRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/cancellations', cancellationRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/v1/b2b', b2bApiRoutes);
app.use('/api/festive-banners', festiveBannerRoutes);

// Global Error Handler to catch [object Object] issues
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ message: err.message || "Internal Server Error", error: err });
});

const PORT = process.env.PORT || 5000;

// Multi-supplier search mode: All suppliers & manual FD unlocked
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
 
