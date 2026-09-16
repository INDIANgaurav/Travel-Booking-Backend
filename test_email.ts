import dotenv from 'dotenv';
dotenv.config();

import { sendBookingConfirmationEmail } from './src/utils/email.service';
import mongoose from 'mongoose';

async function test() {
  try {
    const mockBooking = {
      _id: new mongoose.Types.ObjectId(),
      bookingId: 'BKG-FL-123456',
      totalAmount: 8470,
      date: '2026-10-15T13:00:00.000Z',
      details: {
        airline: '6E 324 ECONOMY',
        from: 'DEL (DEL)',
        to: 'BOM (BOM)',
        pnr: 'ORN014VODUQ',
        passengers: [
          { name: 'MR GAURAV SHARMA', type: 'adult' }
        ]
      }
    };

    console.log('Sending email...');
    await sendBookingConfirmationEmail(
      'gasharma512@gmail.com',
      'Gaurav Sharma',
      mockBooking
    );
    console.log('Test email sent successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error sending email:', error);
    process.exit(1);
  }
}

test();
