import mongoose from 'mongoose';
import { DynamicPage } from './src/modules/settings/settings.model';

const MONGO_URI = "mongodb+srv://travelbookingdb:TravelBookingDb@travelbookingdb.kyvovju.mongodb.net/travel_booking_app?retryWrites=true&w=majority";

const content = `
    <p><strong>1. Acceptance of Terms</strong><br>
    Welcome to TrippeChalo. By registering as a B2B agent and accessing our portal, you agree to comply with and be bound by the following Terms & Conditions. If you do not agree to these terms, please do not use our services.</p>
    <br>
    <p><strong>2. Agent Registration & Responsibilities</strong></p>
    <ul>
      <li>All agents must provide accurate and verifiable information during registration (including PAN/GST details where applicable).</li>
      <li>You are strictly responsible for maintaining the confidentiality of your login credentials. Any booking made from your account will be considered authorized by you.</li>
      <li>You must ensure that all details provided on behalf of your customers (passengers) are 100% accurate before confirming a booking.</li>
    </ul>
    <br>
    <p><strong>3. Booking & Payment Policy</strong></p>
    <ul>
      <li>Fares and inventory are dynamic and subject to change without prior notice until the ticket or voucher is completely generated.</li>
      <li>Payments must be cleared via your wallet balance, authorized credit limit, or approved payment gateways before a booking is confirmed.</li>
      <li>TrippeChalo reserves the right to cancel any booking if fraudulent payment activity is suspected.</li>
    </ul>
    <br>
    <p><strong>4. Cancellations, Amendments & Refunds</strong></p>
    <ul>
      <li>All cancellations and amendments are governed by the respective airline, hotel, or supplier policies.</li>
      <li>TrippeChalo applies a nominal service fee for processing cancellations/amendments over and above the supplier's charges.</li>
      <li>Refunds for cancelled bookings will be credited to your TrippeChalo agent wallet within standard banking processing times after receiving the amount from the supplier.</li>
    </ul>
    <br>
    <p><strong>5. Liability Disclaimer</strong></p>
    <ul>
      <li>TrippeChalo acts only as a technology platform and a facilitator. We are not liable for any flight delays, cancellations, baggage loss, or unsatisfactory service provided by the actual travel operators (airlines, hotels, etc.).</li>
      <li>We are not responsible for any visa rejections or travel restrictions faced by your end-customers.</li>
    </ul>
    <br>
    <p><strong>6. Termination</strong><br>
    TrippeChalo reserves the right to suspend or terminate your agent account without prior notice if we detect any breach of these Terms, fraudulent activities, or unethical business practices.</p>
`;

async function updateDB() {
  try {
    await mongoose.connect(MONGO_URI);
    const pageName = 'TermsConditions';
    const headline = 'Terms & Conditions for TrippeChalo';
    
    await DynamicPage.findOneAndUpdate(
      { pageName },
      { headline, content },
      { upsert: true, new: true }
    );
    console.log('Successfully updated Terms & Conditions in the database.');
  } catch (error) {
    console.error('Error updating DB:', error);
  } finally {
    await mongoose.disconnect();
  }
}

updateDB();
