import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
import fs from 'fs';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

interface EmailAttachment {
  filename: string;
  content: string | Buffer; // Base64 string for Brevo, Buffer for Nodemailer
}

const sendEmail = async (to: string, subject: string, htmlContent: string, senderName: string = "TrippeChalo India", attachments?: EmailAttachment[]) => {
  if (!process.env.BREVO_API_KEY && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
    console.warn('⚠️ Neither BREVO_API_KEY nor (EMAIL_USER + EMAIL_PASS) are set in .env. Skipping actual email send.');
    console.log(`[Simulated Email] To: ${to}, Subject: ${subject}`);
    return;
  }

  const mailOptions = {
    from: `"${senderName}" <${process.env.EMAIL_USER || 'no-reply@trippechalo.com'}>`,
    to,
    subject,
    html: htmlContent,
    ...(attachments && { attachments })
  };

  try {
    const brevoKey = process.env.BREVO_API_KEY;
    console.log(`\n[Email Service] Attempting to send email to ${to}...`);

    if (brevoKey) {
      console.log(`[Email Service] Using Brevo HTTP API (Port 443)...`);
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: senderName,
            email: process.env.EMAIL_USER || 'no-reply@trippechalo.com'
          },
          to: [{ email: to }],
          subject: subject,
          htmlContent: htmlContent,
          ...(attachments && {
            attachment: attachments.map(att => ({
              name: att.filename,
              content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content
            }))
          })
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo API Error: ${errorText}`);
      }
      const data = await response.json();
      console.log(`Email sent via Brevo API: ${data.messageId}`);
      return data;
    } else {
      console.log(`[Email Service] Using Nodemailer (SMTP)...`);
      const sendPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Email sending timed out after 6 seconds')), 6000);
      });
      
      const info = await Promise.race([sendPromise, timeoutPromise]) as any;
      console.log(`Email sent via Nodemailer: ${info.messageId}`);
      return info;
    }
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

const getBaseTemplate = (title: string, subtitle: string, bodyContent: string, maxWidth: number = 540) => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: ${maxWidth}px; margin: 0 auto; padding: 0; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #f0f0f0;">
    <div style="background: #1a3673; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 0.5px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
        <span style="color: #ffffff;">Trippe</span><span style="color: #60a5fa;">Chalo</span> <span style="color: #fb923c; font-size: 16px; margin-left: 4px; background: rgba(251, 146, 60, 0.2); padding: 2px 8px; border-radius: 6px; letter-spacing: 1px;">INDIA</span>
      </h1>
      <p style="color: #a3b8e8; margin: 8px 0 0 0; font-size: 14px;">${subtitle}</p>
    </div>
    <div style="padding: 30px 25px;">
      ${bodyContent}
    </div>
    <div style="background-color: #f8fafc; padding: 25px 20px; text-align: center; border-top: 1px solid #f1f5f9;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 5px 0;">This is an automated message. Please do not reply.</p>
      <p style="color: #64748b; font-size: 12px; font-weight: 600; margin: 15px 0 0 0;">&copy; ${new Date().getFullYear()} TrippeChalo India Private Limited.</p>
      <p style="color: #94a3b8; font-size: 11px; margin: 5px 0 0 0;">All rights reserved.</p>
    </div>
  </div>
`;

export const sendOTP = async (to: string, otp: string, expiryMinutes: number) => {
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Hello,</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">To complete your verification, please use the One-Time Password (OTP) below:</p>
    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 12px; border: 2px dashed #cbd5e1; margin-bottom: 25px;">
      <h1 style="color: #2563eb; margin: 0; font-size: 38px; font-weight: 800; letter-spacing: 8px;">${otp}</h1>
    </div>
    <p style="color: #64748b; font-size: 14px; margin: 0; text-align: center;">This code will expire in <strong style="color: #ef4444;">${expiryMinutes} minutes</strong>.</p>
    <p style="color: #64748b; font-size: 14px; margin: 10px 0 0 0; text-align: center;">Please do not share this code with anyone for your security.</p>
  `;
  await sendEmail(to, 'Your TrippeChalo India Verification Code', getBaseTemplate('TrippeChalo India', 'Secure Verification', body), "TrippeChalo India Security");
};

export const sendWelcomeEmail = async (to: string, name: string) => {
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Dear ${name},</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">Welcome to TrippeChalo India B2B Portal! Your registration has been received successfully.</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">Our team will review your application and approve it shortly. Once approved, you will have full access to our B2B travel inventory.</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 10px 0; line-height: 1.5;">Thank you for partnering with us.</p>
  `;
  await sendEmail(to, 'Welcome to TrippeChalo India', getBaseTemplate('TrippeChalo India', 'Registration Successful', body));
};

export const sendAccountApprovedEmail = async (to: string, name: string) => {
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Dear ${name},</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">Great news! Your TrippeChalo India agent account has been <strong>Approved</strong>.</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">You can now log in to the portal, add funds to your wallet, and start booking flights at exclusive B2B rates.</p>
    <a href="https://trippechalo.com/login" style="display: block; width: 200px; margin: 0 auto; background-color: #2563eb; color: #fff; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: bold;">Login Now</a>
  `;
  await sendEmail(to, 'Account Approved - TrippeChalo India', getBaseTemplate('TrippeChalo India', 'Account Approved', body));
};

export const sendWalletTopupEmail = async (to: string, name: string, amount: number, newBalance: number, reference: string) => {
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Dear ${name},</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 20px 0; line-height: 1.5;">Your wallet top-up request has been successfully processed and approved.</p>
    <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 25px;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;"><strong>Top-up Amount:</strong> ₹${amount.toLocaleString('en-IN')}</p>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;"><strong>New Wallet Balance:</strong> <span style="color: #059669; font-weight: bold;">₹${newBalance.toLocaleString('en-IN')}</span></p>
      <p style="margin: 0; font-size: 14px; color: #475569;"><strong>Reference No:</strong> ${reference}</p>
    </div>
    <p style="color: #64748b; font-size: 15px; margin: 0; line-height: 1.5;">You can now use this balance to book flights and hotels seamlessly.</p>
  `;
  await sendEmail(to, 'Wallet Top-up Successful', getBaseTemplate('TrippeChalo India', 'Wallet Top-up Success', body), "TrippeChalo India Finance");
};

export const generatePDFTicket = (booking: any, agentName: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pnr = booking.details?.pnr || booking.bookingId;
      const flightNo = booking.details?.flightNo || booking.details?.airline || 'FL-324';
      const origin = booking.details?.from || 'Origin';
      const destination = booking.details?.to || 'Destination';
      const depTime = booking.date && String(booking.date).includes('T') 
        ? new Date(booking.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) 
        : (booking.details?.departureTime || '12:00');
      const arrTime = booking.details?.arrivalTime 
        ? (String(booking.details.arrivalTime).includes('T') 
            ? new Date(booking.details.arrivalTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) 
            : booking.details.arrivalTime)
        : depTime;
      const dateStr = new Date(booking.date || booking.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const issueDateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

      // 1. Header Banner
      doc.rect(36, 36, 523, 60).fill('#0b1031');
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('TRIPPECHALO INDIA', 50, 48);
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('E-TICKET / RESERVATION VOUCHER', 50, 72);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('GSTIN: 09AAMCT8505A1ZB', 380, 50, { align: 'right', width: 165 });
      doc.fillColor('#cbd5e1').fontSize(8).font('Helvetica').text('Helpline: +91 95559 34205', 380, 68, { align: 'right', width: 165 });

      // 2. Booking Reference Box
      const startY = 108;
      doc.rect(36, startY, 523, 45).fill('#f8fafc').stroke('#cbd5e1');
      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('AIRLINE PNR', 50, startY + 8);
      doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(String(pnr).toUpperCase(), 50, startY + 20);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('BOOKING ID', 220, startY + 8);
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(booking.bookingId, 220, startY + 22);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('ISSUED ON', 400, startY + 8);
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica').text(issueDateStr, 400, startY + 22);

      // 3. Flight Details Section
      const flightY = 165;
      doc.rect(36, flightY, 523, 20).fill('#e2e8f0');
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text('FLIGHT ITINERARY', 46, flightY + 5);

      const flightContentY = flightY + 25;
      doc.rect(36, flightContentY, 523, 65).fill('#ffffff').stroke('#e2e8f0');
      doc.fillColor('#0b1031').fontSize(12).font('Helvetica-Bold').text(`${flightNo}`, 50, flightContentY + 12);
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text('Class: Economy', 50, flightContentY + 28);
      doc.fillColor('#16a34a').fontSize(9).font('Helvetica-Bold').text('Status: Confirmed', 50, flightContentY + 44);

      doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(origin, 180, flightContentY + 12);
      doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`${depTime} • ${dateStr}`, 180, flightContentY + 30);

      doc.fillColor('#3b82f6').fontSize(16).font('Helvetica-Bold').text('➔', 320, flightContentY + 16);

      doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(destination, 370, flightContentY + 12);
      doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`${arrTime} • ${dateStr}`, 370, flightContentY + 30);

      // 4. Passenger Details Table
      const paxHeaderY = 270;
      doc.rect(36, paxHeaderY, 523, 20).fill('#e2e8f0');
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text('PASSENGER DETAILS', 46, paxHeaderY + 5);

      let paxY = paxHeaderY + 25;
      const passengersList = booking.details?.passengers && booking.details.passengers.length > 0 
        ? booking.details.passengers 
        : [{ name: agentName || 'Primary Passenger', type: 'Adult' }];

      // Table Header
      doc.rect(36, paxY, 523, 18).fill('#f1f5f9');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('#', 46, paxY + 5);
      doc.text('PASSENGER NAME', 80, paxY + 5);
      doc.text('TYPE', 280, paxY + 5);
      doc.text('SEAT', 370, paxY + 5);
      doc.text('STATUS', 470, paxY + 5);
      paxY += 20;

      passengersList.forEach((pax: any, i: number) => {
        const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        doc.rect(36, paxY, 523, 22).fill(rowBg).stroke('#e2e8f0');
        doc.fillColor('#334155').fontSize(9).font('Helvetica').text(String(i + 1), 46, paxY + 6);
        const pName = (pax.name || `${pax.firstName || ''} ${pax.lastName || ''}` || 'Passenger').toUpperCase();
        doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(pName, 80, paxY + 6);
        doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(pax.type || 'Adult', 280, paxY + 6);
        doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(pax.seat || 'Assigned at check-in', 370, paxY + 6);
        doc.fillColor('#16a34a').fontSize(8).font('Helvetica-Bold').text('CONFIRMED', 470, paxY + 6);
        paxY += 24;
      });

      // 5. Payment Summary Box
      paxY += 15;
      doc.rect(36, paxY, 523, 45).fill('#f8fafc').stroke('#cbd5e1');
      doc.fillColor('#0b1031').fontSize(10).font('Helvetica-Bold').text('PAYMENT SUMMARY', 50, paxY + 8);
      const totalAmt = Number(booking.totalAmount || 0).toLocaleString('en-IN');
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(`Total Fare Paid: ₹ ${totalAmt}`, 50, paxY + 25);
      doc.fillColor('#16a34a').fontSize(9).font('Helvetica-Bold').text(`Payment Status: SUCCESS (${booking.paymentMethod || 'WALLET'})`, 330, paxY + 25);

      // 6. Important Guidelines
      paxY += 60;
      doc.rect(36, paxY, 523, 70).fill('#fffbeb').stroke('#fef3c7');
      doc.fillColor('#b45309').fontSize(8).font('Helvetica-Bold').text('IMPORTANT TRAVEL INFORMATION', 50, paxY + 8);
      doc.fillColor('#78350f').fontSize(7.5).font('Helvetica')
        .text('• Passengers must present a government-issued photo ID along with this ticket at airport security.', 50, paxY + 22)
        .text('• Check-in counters close 60 minutes prior to domestic departures and 75 minutes prior to international departures.', 50, paxY + 34)
        .text('• Standard Baggage: Check-in 15 Kg (1 piece) / Cabin 7 Kg per passenger (subject to airline rules).', 50, paxY + 46)
        .text('• For flight status, rescheduling, or cancellations, please contact 24x7 Support: +91 95559 34205.', 50, paxY + 58);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
};

export const generateBookingInvoicePdf = generatePDFTicket;

export const sendBookingConfirmationEmail = async (to: string, name: string, booking: any) => {
  const pnr = booking.details?.pnr || booking.bookingId;
  const airline = booking.details?.airline || 'Airline';
  const flightNo = booking.details?.flightNo || 'FLIGHT';
  const origin = booking.details?.from || 'Origin';
  const destination = booking.details?.to || 'Destination';
  
  const depTime = booking.details?.departureTime 
    ? new Date(booking.details.departureTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) 
    : '12:00';
  const arrTime = booking.details?.arrivalTime 
    ? new Date(booking.details.arrivalTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) 
    : '14:00';
    
  const travelDateStr = booking.date 
    ? new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'N/A';
    
  const amount = booking.totalAmount || 0;
  const baseFare = (amount * 0.6).toFixed(2);
  const taxesAndFees = (amount * 0.4).toFixed(2);
  
  const ticketLink = booking._id ? `http://localhost:5173/dashboard/ticket/${booking._id}` : '#';
  const invoiceLink = booking._id ? `http://localhost:5173/dashboard/invoice/${booking._id}` : '#';
  
  const passengersList = booking.details?.passengers && booking.details.passengers.length > 0 
    ? booking.details.passengers 
    : [{ name: name || 'Passenger', type: 'Adult' }];

  const passengersRows = passengersList.map((pax: any, idx: number) => `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 10px 8px; font-size: 13px; color: #1e293b; font-weight: 600;">${pax.name || (pax.firstName ? pax.firstName + ' ' + (pax.lastName || '') : 'Passenger ' + (idx + 1))}</td>
      <td style="padding: 10px 8px; font-size: 12px; color: #64748b;">${pax.type || 'Adult'}</td>
      <td style="padding: 10px 8px; font-size: 12px; color: #64748b; text-align: center;">${booking.details?.seats?.[idx] || pax.seat || 'Assigned at Check-in'}</td>
      <td style="padding: 10px 8px; font-size: 12px; color: #16a34a; font-weight: bold; text-align: right;">Confirmed</td>
    </tr>
  `).join('');

  let attachments = undefined;
  try {
    const pdfBuffer = await generatePDFTicket(booking, name);
    attachments = [{ filename: `E-Ticket-${pnr}.pdf`, content: pdfBuffer }];
  } catch (err) {
    console.error('Failed to generate PDF attachment:', err);
  }

  const body = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b;">
      <p style="color: #334155; font-size: 16px; margin: 0 0 8px 0; font-weight: 600;">Dear ${name},</p>
      <p style="color: #64748b; font-size: 14px; margin: 0 0 20px 0; line-height: 1.5;">Your flight booking is <strong>Confirmed</strong>! Below are your official <strong>E-Ticket</strong> and <strong>Tax Invoice</strong> details.</p>
      
      <!-- PNR Hero Box -->
      <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 20px; border-radius: 12px; border: 2px dashed #2563eb; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 11px; text-transform: uppercase; color: #1e40af; font-weight: 700; letter-spacing: 1.5px; display: block; margin-bottom: 4px;">Airline Booking Reference / PNR</span>
        <h2 style="margin: 0; font-size: 32px; color: #1e40af; font-weight: 900; letter-spacing: 4px;">${pnr}</h2>
        <span style="font-size: 12px; color: #475569; display: block; margin-top: 6px;">Booking ID: <strong>${booking.bookingId}</strong> &bull; Status: <strong style="color: #16a34a;">CONFIRMED</strong></span>
      </div>

      <!-- SECTION 1: E-TICKET DETAILS -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div style="background-color: #1e293b; color: #ffffff; padding: 10px 16px;">
          <strong style="font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">✈ Official E-Ticket Details</strong>
        </div>
        
        <!-- Flight Route Banner -->
        <div style="padding: 16px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 40%; vertical-align: top;">
                <p style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0;">${origin}</p>
                <p style="font-size: 14px; font-weight: 600; color: #2563eb; margin: 4px 0 0 0;">${depTime}</p>
                <p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">${travelDateStr}</p>
              </td>
              <td style="width: 20%; text-align: center; vertical-align: middle;">
                <span style="font-size: 18px; color: #94a3b8;">✈</span>
                <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0; font-weight: 600;">Non-Stop</p>
              </td>
              <td style="width: 40%; text-align: right; vertical-align: top;">
                <p style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0;">${destination}</p>
                <p style="font-size: 14px; font-weight: 600; color: #2563eb; margin: 4px 0 0 0;">${arrTime}</p>
                <p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">${travelDateStr}</p>
              </td>
            </tr>
          </table>
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #475569;">
            <strong>Airline:</strong> ${airline} (${flightNo}) &bull; <strong>Class:</strong> Economy &bull; <strong>Baggage:</strong> 15 Kg Check-in, 7 Kg Cabin
          </div>
        </div>

        <!-- Passengers Table -->
        <div style="padding: 12px 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b;">
                <th style="text-align: left; padding: 6px 8px;">Passenger</th>
                <th style="text-align: left; padding: 6px 8px;">Type</th>
                <th style="text-align: center; padding: 6px 8px;">Seat</th>
                <th style="text-align: right; padding: 6px 8px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${passengersRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 2: TAX INVOICE & PAYMENT SUMMARY -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div style="background-color: #0f172a; color: #ffffff; padding: 10px 16px;">
          <strong style="font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;">🧾 Tax Invoice & Fare Breakdown</strong>
        </div>
        <div style="padding: 16px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Air Fare (Base Fare)</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #0f172a;">₹${baseFare}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Airline Taxes & Airport Surcharges</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #0f172a;">₹${taxesAndFees}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Payment Method</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #0f172a;">${booking.paymentMethod || 'Online'}</td>
            </tr>
            <tr style="background-color: #f8fafc; font-weight: bold; font-size: 14px;">
              <td style="padding: 10px 8px; color: #0f172a;">Total Gross Amount Paid</td>
              <td style="padding: 10px 8px; text-align: right; color: #16a34a; font-size: 16px;">₹${amount.toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Action Buttons Side-by-Side -->
      <div style="text-align: center; margin: 25px 0 10px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px; text-align: center;">
              <a href="${ticketLink}" style="background-color: #1e293b; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 13px; display: inline-block; min-width: 160px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                🎫 View / Download E-Ticket
              </a>
            </td>
            <td style="padding: 6px; text-align: center;">
              <a href="${invoiceLink}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 13px; display: inline-block; min-width: 160px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                🧾 View Tax Invoice
              </a>
            </td>
          </tr>
        </table>
      </div>
      <p style="color: #94a3b8; font-size: 11px; margin-top: 15px; text-align: center;">You can access and print your confirmed E-Ticket or Tax Invoice anytime from your account dashboard.</p>
    </div>
  `;
  await sendEmail(to, `Booking Confirmed: E-Ticket & Tax Invoice - PNR: ${pnr}`, getBaseTemplate('TrippeChalo India', 'Booking Confirmation', body, 620), "TrippeChalo India Bookings", attachments);
};

export const sendCancellationEmail = async (to: string, name: string, pnr: string, refundAmount: number) => {
  const isRefundApplicable = refundAmount > 0;
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Dear ${name || 'Valued Customer'},</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 20px 0; line-height: 1.5;">Your flight cancellation has been processed successfully.</p>
    <div style="background-color: #fef2f2; padding: 20px; border-radius: 12px; border: 1px solid #fecaca; margin-bottom: 25px;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;"><strong>Airline PNR:</strong> ${pnr}</p>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;"><strong>Booking Status:</strong> <span style="color: #dc2626; font-weight: bold;">Cancelled</span></p>
      ${isRefundApplicable ? `
      <p style="margin: 0; font-size: 14px; color: #475569;"><strong>Refund Amount:</strong> <span style="color: #059669; font-weight: bold;">₹${refundAmount.toLocaleString('en-IN')}</span> (Credited to Wallet)</p>
      ` : `
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;"><strong>Fare Category:</strong> Non-Refundable / Series Fare</p>
      <p style="margin: 0; font-size: 13px; color: #991b1b; line-height: 1.4;"><strong>Refund Status:</strong> No refund applicable as per airline fixed-departure contract rules.</p>
      `}
    </div>
    ${isRefundApplicable ? `
    <p style="color: #64748b; font-size: 14px; margin: 0; line-height: 1.5;">The approved refund amount has been credited to your TrippeChalo wallet.</p>
    ` : `
    <p style="color: #64748b; font-size: 14px; margin: 0; line-height: 1.5;">If you have any questions regarding this cancellation, feel free to reach out to TrippeChalo Support.</p>
    `}
  `;
  await sendEmail(to, `Booking Cancelled - PNR: ${pnr}`, getBaseTemplate('TrippeChalo India', 'Booking Cancellation', body), "TrippeChalo India Support");
};
