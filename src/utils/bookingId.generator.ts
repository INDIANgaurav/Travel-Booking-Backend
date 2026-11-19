import crypto from 'crypto';
import Booking from '../modules/bookings/booking.model';

/**
 * Generates a collision-resistant, cryptographically secure Booking ID
 * Format: TC-{PREFIX}-{YYMM}-{8_RANDOM_HEX_BYTES}
 * Example: TC-FL-2611-4E7F9B128A30CD55
 * 
 * Provides:
 * 1. 2^64 (1.84 x 10^19) entropy per month
 * 2. Active MongoDB collision check
 * 3. Automatic retry loop
 */
export async function generateSecureBookingId(prefix: 'FL' | 'HTL' | 'PKG' | 'BUS'): Promise<string> {
  const now = new Date();
  const yearStr = now.getFullYear().toString().slice(-2);
  const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
  const dateSlug = `${yearStr}${monthStr}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const randomBytes = crypto.randomBytes(8).toString('hex').toUpperCase();
    const candidateId = `TC-${prefix}-${dateSlug}-${randomBytes}`;

    // Verify uniqueness in database
    const exists = await Booking.exists({ bookingId: candidateId });
    if (!exists) {
      return candidateId;
    }
    console.warn(`[BOOKING ID COLLISION DETECTED] Collision on attempt ${attempt + 1}: ${candidateId}. Regenerating...`);
  }

  // Fallback with high-resolution microsecond timestamp
  const hrTime = process.hrtime.bigint().toString(36).toUpperCase();
  const fallbackRandom = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `TC-${prefix}-${dateSlug}-${hrTime}-${fallbackRandom}`;
}

