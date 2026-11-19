import crypto from 'crypto';

export const B2B_MAX_PASSENGERS = 9;

export function getB2BJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 8) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing or too short.');
  }
  return secret;
}

export interface PassengerCountsValidation {
  valid: boolean;
  code?: string;
  message?: string;
  adults: number;
  children: number;
  infants: number;
}

/**
 * Shared validation for adult/child/infant counts across both Search and Booking.
 */
export function validatePassengerCounts(rawAdults: any, rawChildren: any, rawInfants: any): PassengerCountsValidation {
  const adults = Number(rawAdults);
  const children = Number(rawChildren);
  const infants = Number(rawInfants);

  if (!Number.isInteger(adults) || !Number.isInteger(children) || !Number.isInteger(infants)) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      message: 'Passenger counts (adults, children, infants) must be whole integers.',
      adults: 0,
      children: 0,
      infants: 0,
    };
  }

  if (adults < 1 || children < 0 || infants < 0) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      message: 'Minimum 1 adult is required, and children/infants counts cannot be negative.',
      adults,
      children,
      infants,
    };
  }

  if (adults + children + infants > B2B_MAX_PASSENGERS) {
    return {
      valid: false,
      code: 'PASSENGER_LIMIT_EXCEEDED',
      message: `Maximum ${B2B_MAX_PASSENGERS} total passengers (adults + children + infants) allowed per request.`,
      adults,
      children,
      infants,
    };
  }

  if (infants > adults) {
    return {
      valid: false,
      code: 'INFANT_COUNT_EXCEEDED',
      message: 'Number of infants cannot exceed the number of adult passengers (1 lap infant per adult).',
      adults,
      children,
      infants,
    };
  }

  return { valid: true, adults, children, infants };
}

/**
 * Calculates passenger age on the travel date and verifies it matches ADULT / CHILD / INFANT category.
 */
export function validateAgeForPassengerType(
  dobStr: string,
  passengerType: 'ADULT' | 'CHILD' | 'INFANT',
  travelDate: Date
): { valid: boolean; code?: string; message?: string } {
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) {
    return { valid: false, code: 'INVALID_DOB', message: `Invalid date of birth "${dobStr}". Expected YYYY-MM-DD.` };
  }

  const refDate = isNaN(travelDate.getTime()) ? new Date() : travelDate;
  if (dob.getTime() > refDate.getTime()) {
    return { valid: false, code: 'INVALID_DOB', message: 'Date of birth cannot be after travel date.' };
  }

  let ageYears = refDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = refDate.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && refDate.getUTCDate() < dob.getUTCDate())) {
    ageYears--;
  }

  if (passengerType === 'INFANT' && ageYears >= 2) {
    return {
      valid: false,
      code: 'AGE_CATEGORY_MISMATCH',
      message: `Passenger marked as INFANT is ${ageYears} years old on travel date (must be under 2 years).`,
    };
  }

  if (passengerType === 'CHILD' && (ageYears < 2 || ageYears >= 12)) {
    return {
      valid: false,
      code: 'AGE_CATEGORY_MISMATCH',
      message: `Passenger marked as CHILD is ${ageYears} years old on travel date (must be 2 to 11 years).`,
    };
  }

  if (passengerType === 'ADULT' && ageYears < 12) {
    return {
      valid: false,
      code: 'AGE_CATEGORY_MISMATCH',
      message: `Passenger marked as ADULT is ${ageYears} years old on travel date (must be 12+ years).`,
    };
  }

  return { valid: true };
}

/**
 * Generates collision-resistant booking reference (BK-B2B- + 12 hex/time-sortable chars).
 */
export function generateB2BBookingId(): string {
  const timePart = Date.now().toString(36).toUpperCase().slice(-5);
  const randPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `BK-B2B-${timePart}${randPart}`;
}

/**
 * Canonical SHA-256 hash of booking request parameters for idempotency payload conflict detection.
 */
export function computeBookingRequestHash(payload: {
  sfId: string;
  environment: string;
  passengers: any[];
  contactDetails?: any;
}): string {
  const canonicalPassengers = (payload.passengers || []).map((p) => ({
    title: String(p.title || '').trim().toUpperCase(),
    firstName: String(p.firstName || '').trim().toUpperCase(),
    lastName: String(p.lastName || '').trim().toUpperCase(),
    type: String(p.type || 'ADULT').trim().toUpperCase(),
    dob: String(p.dob || '').trim(),
    gender: String(p.gender || '').trim().toUpperCase(),
    passportNumber: String(p.passportNumber || '').trim().toUpperCase(),
  }));

  const canonical = JSON.stringify({
    sfId: String(payload.sfId || '').trim(),
    environment: payload.environment,
    passengers: canonicalPassengers,
  });

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

