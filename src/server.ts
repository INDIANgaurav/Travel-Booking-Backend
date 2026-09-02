import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import connectDB from './config/db';
import './config/firebase-admin';
import { mongoSanitize } from './middleware/sanitize.middleware';

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
import { seedSuppliers } from './modules/supplier/supplier.service';

connectDB().then(() => {
  seedSuppliers();
});

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Security Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(mongoSanitize); // Custom middleware to prevent NoSQL Injection

app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'], // Allowing standard React/Vite ports
  credentials: true,
}));

app.get('/', (req, res) => {
  res.send('Travel Booking App API is running (TypeScript)...');
});

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: 'Too many requests from this IP, please try again after 15 minutes' });
app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
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
app.get('/api/test-supplier', (req, res) => res.json({ status: 'ok' }));
app.use('/api/suppliers', supplierRoutes);

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
app.use('/api/suppliers', supplierRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/cancellations', cancellationRoutes);
app.use('/api/tickets', ticketRoutes);

// Global Error Handler to catch [object Object] issues
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ message: err.message || "Internal Server Error", error: err });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});