import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db';

import authRoutes from './modules/auth/auth.routes';
import adminRoutes from './modules/users/admin.routes';
import userRoutes from './modules/users/user.routes';
import agentRoutes from './modules/agents/agent.routes';
import tourRoutes from './modules/tours/tour.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import searchRoutes from './modules/searches/search.routes';
import bookingRoutes from './modules/bookings/booking.routes';
import cmsRoutes from './modules/cms/cms.routes';

dotenv.config();

connectDB();

const app = express();

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'], // Allowing standard React/Vite ports
  credentials: true,
}));

app.get('/', (req, res) => {
  res.send('Travel Booking App API is running (TypeScript)...');
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/tours', tourRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/searches', searchRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/cms', cmsRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});