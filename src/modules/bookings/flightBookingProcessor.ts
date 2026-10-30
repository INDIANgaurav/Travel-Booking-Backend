import { bookFlight as bookFlightNexus } from '../flights/nexusdmc.service';
import { bookFlight as bookFlightGapi } from '../flights/gapi.service';
import { bookFlightAirIq } from '../flights/airiq.service';
import SeriesFare from '../seriesFare/seriesFare.model';
import mongoose from 'mongoose';
import { clearFlightSearchCache } from '../searches/search.controller';

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
  if (details.isAirIqFare || (details.flight_keys && details.flight_keys[0]?.startsWith('AIRIQ_')) || details.airIq_ticket_id) {
    supplierCode = 'AIRIQ';
  } else if (details.isGapiFare || (details.flight_keys && details.flight_keys[0]?.startsWith('GAPI_')) || details.resultSessionId) {
    supplierCode = 'GAPI';
  } else if (details.isSeriesFare || (details.flight_keys && details.flight_keys[0]?.startsWith('SF_'))) {
    supplierCode = 'SERIES';
  }

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
        const paxCount = details.passengers?.length || 1;
        const hold = await SeatHold.findOne({ userId, flightId: sfIdClean, status: 'ACTIVE' });
        
        if (hold && new Date() <= hold.expiresAt) {
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
        } else {
           // Fallback: Atomic Compare-And-Swap (CAS) direct seat reservation
           // Protects against race conditions if SeatHold was bypassed or expired
           const updatedSF = await SeriesFare.findOneAndUpdate(
             {
               _id: sfIdClean,
               status: 'Active',
               isArchived: false,
               availableSeats: { $gte: paxCount }
             },
             {
               $inc: { availableSeats: -paxCount }
             },
             { returnDocument: 'after' }
           );

           if (!updatedSF) {
             apiBookingFailed = true;
             details.api_error = 'Seats are no longer available. Flight is either sold out or was reserved by another customer.';
           } else {
             if (updatedSF.availableSeats === 0) {
               await SeriesFare.updateOne({ _id: sfIdClean }, { status: 'SoldOut' });
             }
             details.pnr = updatedSF.airlinePnr || 'PENDING';
             newStatus = 'CONFIRMED';
           }
        }
        clearFlightSearchCache();
      }
    } else if (supplierCode === 'AIRIQ') {
      const ticketId = details.airIq_ticket_id || details.ticket_id || (details.flight_keys && details.flight_keys[0]?.replace('AIRIQ_', ''));
      const rawPassengers = details.passengers || [];

      // Partition passengers into Adult, Child, Infant conforming to AirIQ requirements
      const adults: any[] = [];
      const children: any[] = [];
      const infants: any[] = [];

      rawPassengers.forEach((p: any) => {
        const type = (p.type || 'ADULT').toUpperCase();
        
        // AirIQ Title Enum must be one of: Mr. | Mrs. | Ms. | Mstr. | Miss
        let title = 'Mr.';
        const gender = (p.gender || 'Male').toLowerCase();
        const pTitle = (p.title || '').replace(/\./g, '').trim().toUpperCase();

        if (type === 'ADULT') {
          if (pTitle === 'MRS') title = 'Mrs.';
          else if (pTitle === 'MS') title = 'Ms.';
          else if (pTitle === 'MISS') title = 'Miss';
          else if (gender === 'female') title = 'Ms.';
          else title = 'Mr.';
        } else if (type === 'CHILD') {
          if (pTitle === 'MISS' || gender === 'female') title = 'Miss';
          else title = 'Mstr.';
        } else if (type === 'INFANT') {
          if (pTitle === 'MISS' || gender === 'female') title = 'Miss';
          else title = 'Mstr.';
        }

        const nameParts = (p.name || '').trim().split(' ');
        const firstName = (p.firstName || nameParts[0] || 'Passenger').trim();
        const lastName = (p.lastName || nameParts.slice(1).join(' ') || 'User').trim();

        // DOB format: YYYY/MM/DD
        const defaultDob = type === 'CHILD' ? '2018/01/01' : (type === 'INFANT' ? '2025/01/01' : '1990/01/01');
        const dob = p.dob ? new Date(p.dob).toISOString().split('T')[0].replace(/-/g, '/') : defaultDob;

        // Passport details
        const defaultExpiry = '2032/01/01';
        const passportExpiry = p.passportExpiry ? new Date(p.passportExpiry).toISOString().split('T')[0].replace(/-/g, '/') : defaultExpiry;
        const passportNumber = p.passportNum || p.passportNumber || `IN${Math.floor(1000000 + Math.random() * 9000000)}`;
        const nationality = p.nationality || 'IN';

        const paxItem = {
          title,
          first_name: firstName,
          last_name: lastName,
          dob,
          passport_number: passportNumber,
          passport_expirydate: passportExpiry,
          passport_issuing_country_code: nationality,
          nationality: nationality
        };

        if (type === 'CHILD') children.push(paxItem);
        else if (type === 'INFANT') infants.push(paxItem);
        else adults.push(paxItem);
      });

      const bookPayload = {
        ticket_id: ticketId,
        total_pax: adults.length + children.length + infants.length,
        adult: adults.length,
        child: children.length,
        infant: infants.length,
        adult_info: adults,
        child_info: children,
        infant_info: infants
      };

      console.log(`Executing AirIQ Booking for ${bookingId} with ticket_id snippet: ${ticketId?.substring(0, 25)}...`);
      const bookResult = await bookFlightAirIq(bookPayload);

      if (bookResult && (bookResult.status === 'success' || bookResult.code === '200')) {
        const bookingIdFromAirIq = bookResult.booking_id || bookResult.data?.booking_id || bookResult.ticket_id || bookingId;
        details.pnr = bookingIdFromAirIq;
        details.airIq_booking_id = bookingIdFromAirIq;
        details.airIq_response = bookResult;

        // Attempt instant ticket/airline PNR fetch
        try {
          const { getTicketAirIq } = require('../flights/airiq.service');
          const ticketInfo = await getTicketAirIq(bookingIdFromAirIq);
          const airlinePnr = ticketInfo?.data?.pnr || ticketInfo?.data?.airline_pnr || ticketInfo?.pnr;
          if (airlinePnr) {
            details.pnr = airlinePnr;
            details.airIq_ticket_details = ticketInfo;
          }
        } catch (tErr: any) {
          console.warn('AirIQ instant ticket fetch note (falling back to booking_id):', tErr.message || tErr);
        }

        newStatus = 'CONFIRMED';
      } else {
        apiBookingFailed = true;
        details.api_error = bookResult?.message || (typeof bookResult?.data === 'string' ? bookResult.data : JSON.stringify(bookResult?.data)) || 'AirIQ returned false success';
      }
    }
  } catch (error: any) {
    console.error(`[Supplier: ${supplierCode}] Booking failed:`, error);
    apiBookingFailed = true;
    details.api_error = error.message || `Exception during ${supplierCode} booking`;
  }

  return { apiBookingFailed, details, status: newStatus };
};
