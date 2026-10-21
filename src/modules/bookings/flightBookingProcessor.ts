import { bookFlight as bookFlightNexus } from '../flights/nexusdmc.service';
import { bookFlight as bookFlightGapi } from '../flights/gapi.service';
import { bookFlightAirIq } from '../flights/airiq.service';
import SeriesFare from '../seriesFare/seriesFare.model';
import mongoose from 'mongoose';

/**
 * Unified Flight Booking Processor
 * Evaluates the details payload and executes the correct supplier API.
 * Follows the Strategy pattern for scalable API integrations.
 */
export const executeFlightSupplierBooking = async (
  bookingId: string, 
  details: any, 
  userId: any
): Promise<{ apiBookingFailed: boolean; details: any; status: 'TICKETING_IN_PROGRESS' | 'CONFIRMED' }> => {
  let apiBookingFailed = false;
  let newStatus: 'TICKETING_IN_PROGRESS' | 'CONFIRMED' = 'TICKETING_IN_PROGRESS';

  if (!details) return { apiBookingFailed, details, status: newStatus };

  let supplierCode = 'NEXUS';
  if (details.isAirIqFare) supplierCode = 'AIRIQ';
  else if (details.isGapiFare || (details.flight_keys && details.flight_keys[0]?.startsWith('GAPI_')) || details.resultSessionId) supplierCode = 'GAPI';
  else if (details.isSeriesFare || (details.flight_keys && details.flight_keys[0]?.startsWith('SF_'))) supplierCode = 'SERIES';

  try {
    if (supplierCode === 'NEXUS') {
      const { nexus_query, flight_keys, total_price, currency, passengers, contactDetails } = details;
      
      const paxes = (passengers || []).map((p: any) => {
        const isChildOrInfant = p.type?.toUpperCase() === 'CHILD' || p.type?.toUpperCase() === 'INFANT';
        let finalTitle = p.title || (p.gender === 'Male' ? (isChildOrInfant ? 'Mstr' : 'Mr') : (isChildOrInfant ? 'Miss' : 'Ms'));
        let upperTitle = finalTitle.toUpperCase();
        
        if (isChildOrInfant) {
          if (upperTitle === 'MR' || upperTitle === 'MSTR') finalTitle = 'Mstr';
          else if (upperTitle === 'MS' || upperTitle === 'MRS' || upperTitle === 'MISS') finalTitle = 'Miss';
          else finalTitle = 'Mstr';
        } else {
          if (upperTitle === 'MSTR' || upperTitle === 'MR') finalTitle = 'Mr';
          else if (upperTitle === 'MISS' || upperTitle === 'MS') finalTitle = 'Ms';
          else if (upperTitle === 'MRS') finalTitle = 'Mrs';
          else finalTitle = 'Mr';
        }
        
        let defaultDob = '1990-01-01';
        if (p.type?.toUpperCase() === 'CHILD') defaultDob = '2018-01-01'; 
        if (p.type?.toUpperCase() === 'INFANT') defaultDob = '2025-01-01'; 
        
        return {
          title: finalTitle,
          first_name: p.name.split(' ')[0] || 'Unknown',
          last_name: p.name.split(' ').slice(1).join(' ') || 'User',
          dob: p.dob ? new Date(p.dob).toISOString().split('T')[0] : defaultDob,
          passport_num: p.passportNum || null,
          passport_expiry_date: p.passportExpiry ? new Date(p.passportExpiry).toISOString().split('T')[0] : null,
          nationality: p.nationality || 'IN',
          type: isChildOrInfant ? (p.type?.toUpperCase() === 'CHILD' ? 'child' : 'infant') : 'adult'
        };
      });

      const client_details = {
        email: contactDetails?.email || '',
        phone: contactDetails?.phone || ''
      };

      const agent_reference = bookingId.replace(/-/g, '');
      const bookResult = await bookFlightNexus(nexus_query, flight_keys, total_price, currency, paxes, client_details, agent_reference);
      
      if (bookResult && bookResult.success) {
        details.pnr = bookResult.response_ref; 
        details.nexus_response = bookResult;
        newStatus = 'CONFIRMED';
      } else {
        apiBookingFailed = true;
        details.api_error = bookResult?.error_msg || 'Nexus returned false success';
      }

    } else if (supplierCode === 'GAPI') {
      const passengers = details.passengers || [];
      const client_details = {
        email: details.contactDetails?.email || '',
        phone: details.contactDetails?.phone || ''
      };
      const agent_reference = bookingId.replace(/-/g, '');
      const bookingSessionId = details.resultSessionId || details.bookingSessionId || (details.flight_keys && details.flight_keys[0]?.replace('GAPI_', ''));

      console.log(`Executing GAPI Booking for ${bookingId} using sessionId: ${bookingSessionId}`);
      const bookResult = await bookFlightGapi(bookingSessionId, passengers, client_details, agent_reference);
      
      if (bookResult && bookResult.success) {
        details.txid = bookResult.response_ref;
        details.pnr = bookResult.response_ref; 
        details.gapi_response = bookResult;

        // Try fetching instant Airline PNR from GAPI
        try {
          const { getBookingDetails: getBookingDetailsGapi } = require('../flights/gapi.service');
          const bookingInfo = await getBookingDetailsGapi(bookResult.response_ref);
          const airlinePnr = bookingInfo?.FlightBookingSecotorDetails?.[0]?.passengerInfo?.[0]?.airlinepnr;
          if (airlinePnr) {
            details.pnr = airlinePnr;
            details.gapi_booking_details = bookingInfo;
          }
        } catch (pnrErr: any) {
          console.warn('GAPI instant PNR fetch note (will fallback to txid):', pnrErr.message || pnrErr);
        }

        newStatus = bookResult.bookingstatus === 'Confirmed' ? 'CONFIRMED' : 'TICKETING_IN_PROGRESS';
      } else {
        apiBookingFailed = true;
        details.api_error = bookResult?.error_msg || 'GAPI returned false success';
      }

    } else if (supplierCode === 'SERIES') {
      const sfId = details.flight_keys[0];
      const sfIdClean = sfId.replace('SF_', '');
      
      if (mongoose.Types.ObjectId.isValid(sfIdClean)) {
        const SeatHold = require('../seriesFare/seatHold.model').default;
        const hold = await SeatHold.findOne({ userId, flightId: sfIdClean, status: 'ACTIVE' });
        
        if (!hold || new Date() > hold.expiresAt) {
           apiBookingFailed = true;
           details.api_error = 'Seat hold expired or not found. Please hold the seats before booking.';
        } else {
           hold.status = 'BOOKED';
           await hold.save();
           
           const seriesFare = await SeriesFare.findById(sfIdClean);
           if (seriesFare) {
              if (seriesFare.availableSeats === 0) {
                  seriesFare.status = 'SoldOut';
                  await seriesFare.save();
              }
              details.pnr = seriesFare.airlinePnr || 'PENDING';
              newStatus = 'CONFIRMED';
           }
        }
      }
    } else if (supplierCode === 'AIRIQ') {
      // Mock transformation of payload since frontend isn't doing it yet
      // This allows the code to compile and be ready for real integration
      const bookPayload = details.airIqPayload || {}; 
      const bookResult = await bookFlightAirIq(bookPayload);
      
      if (bookResult && bookResult.status === 'success') {
        details.pnr = bookResult.booking_id;
        details.airIq_response = bookResult;
        newStatus = 'CONFIRMED';
      } else {
        apiBookingFailed = true;
        details.api_error = bookResult?.message || 'AirIQ returned false success';
      }
    }
  } catch (error: any) {
    console.error(`[Supplier: ${supplierCode}] Booking failed:`, error);
    apiBookingFailed = true;
    details.api_error = error.message || `Exception during ${supplierCode} booking`;
  }

  return { apiBookingFailed, details, status: newStatus };
};
