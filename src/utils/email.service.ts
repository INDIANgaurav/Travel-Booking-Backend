import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
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

const sendEmail = async (to: string, subject: string, htmlContent: string, senderName: string = "TrippeChalo", attachments?: EmailAttachment[]) => {
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
        <span style="color: #ffffff;">Trippe</span><span style="color: #60a5fa;">Chalo</span>
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
  await sendEmail(to, 'Your TrippeChalo Verification Code', getBaseTemplate('TrippeChalo', 'Secure Verification', body), "TrippeChalo Security");
};

export const sendWelcomeEmail = async (to: string, name: string) => {
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Dear ${name},</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">Welcome to TrippeChalo B2B Portal! Your registration has been received successfully.</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">Our team will review your application and approve it shortly. Once approved, you will have full access to our B2B travel inventory.</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 10px 0; line-height: 1.5;">Thank you for partnering with us.</p>
  `;
  await sendEmail(to, 'Welcome to TrippeChalo', getBaseTemplate('TrippeChalo', 'Registration Successful', body));
};

export const sendAccountApprovedEmail = async (to: string, name: string) => {
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Dear ${name},</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">Great news! Your TrippeChalo agent account has been <strong>Approved</strong>.</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">You can now log in to the portal, add funds to your wallet, and start booking flights at exclusive B2B rates.</p>
    <a href="https://trippechalo.com/login" style="display: block; width: 200px; margin: 0 auto; background-color: #2563eb; color: #fff; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: bold;">Login Now</a>
  `;
  await sendEmail(to, 'Account Approved - TrippeChalo', getBaseTemplate('TrippeChalo', 'Account Approved', body));
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
  await sendEmail(to, 'Wallet Top-up Successful', getBaseTemplate('TrippeChalo', 'Wallet Top-up Success', body), "TrippeChalo Finance");
};

const generatePDFTicket = async (booking: any, agentName: string): Promise<Buffer> => {
  const pnr = booking.details?.pnr || booking.bookingId;
  const flightNo = booking.details?.airline || 'FL-324';
  const depTime = booking.date && String(booking.date).includes('T') ? new Date(booking.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '13:00';
  const arrTime = depTime; // Mock arrival
  const dateStr = new Date(booking.createdAt || booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const issueDateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

  const passengersList = booking.details?.passengers && booking.details.passengers.length > 0 
        ? booking.details.passengers 
        : [{ name: agentName, type: 'Adult' }];

  const passengersHTML = passengersList.map((pax: any, i: number) => `
    <tr>
      <td class="py-3 px-3 align-top border-r border-gray-200">
        <p class="mb-1 font-bold">${pnr}</p>
      </td>
      <td class="py-3 px-3 align-top border-r border-gray-200">
        <p class="font-bold text-[12px] uppercase">
          ${pax.name} <span class="text-[10px] font-normal lowercase ml-1">${pax.type || 'Adult'}</span>
        </p>
      </td>
      <td class="py-3 px-3 align-top border-r border-gray-200 font-bold text-gray-800">
        Unassigned
      </td>
      <td class="py-3 px-3 align-top text-right font-medium capitalize">
        Confirmed
      </td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { font-family: sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>
    </head>
    <body class="bg-white p-8 box-border">
      <div class="w-full max-w-4xl bg-white text-black box-border mx-auto border-2 border-gray-200 p-6 rounded-md">
        
        <!-- Header -->
        <div class="flex justify-between items-start border-b-2 border-gray-300 pb-4 mb-6">
          <div>
            <h2 class="text-3xl font-black text-[#0b1031] tracking-tight flex items-center gap-2 mb-1">
              <span class="text-blue-600 font-sans">✈</span>
              <span>Trippe<span class="text-blue-600">Chalo</span></span>
            </h2>
            <p class="text-[11px] text-gray-500 font-medium tracking-widest uppercase">E-Ticket / Reservation Voucher</p>
          </div>
          <div class="text-right text-[11px] text-gray-700">
            <p class="font-bold text-gray-900 mb-1 uppercase">TRIPPECHALO INDIA PRIVATE LIMITED</p>
            <p>First Floor, D 42, Greater Noida Expressway, Sector 108, Noida, Uttar Pradesh - 201304</p>
            <p class="font-bold mt-1">GSTIN: 09AAMCT8505A1ZB</p>
            <p>Phone: +91 95559 34205</p>
          </div>
        </div>

        <!-- Booking Info -->
        <div class="flex justify-between items-start mb-6 text-[12px]">
          <div>
            <p>Booking Reference: <span class="font-bold text-xl ml-2 text-gray-900">${pnr}</span></p>
          </div>
          <div class="text-right">
            <p>Agency Booking ID: <span class="font-bold">${booking.bookingId}</span></p>
            <p>Issued On: <span class="font-bold">${issueDateStr}</span></p>
          </div>
        </div>

        <!-- Content Box -->
        <div class="border-2 border-gray-300 rounded-sm overflow-hidden mb-8">
          <!-- Flight Details -->
          <div>
            <div class="bg-gray-200 px-3 py-1.5 flex justify-between items-center text-[10px] font-bold">
              <span class="uppercase">Flight Details</span>
              <span class="uppercase tracking-wider">ALL TIMINGS MENTIONED ARE IN 24HRS FORMAT AND LOCAL AIRPORT TIMINGS</span>
            </div>
            <table class="w-full text-left text-[11px] border-b border-gray-200">
              <thead class="border-b border-gray-200 bg-white">
                <tr>
                  <th class="p-3 font-normal text-gray-500">Flight</th>
                  <th class="p-3 font-normal text-gray-500">Depart</th>
                  <th class="p-3 font-normal text-gray-500">Arrive</th>
                  <th class="p-3 font-normal text-gray-500 border-l border-gray-200">Duration/Stops</th>
                  <th class="p-3 font-normal text-gray-500 border-l border-gray-200">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="p-3 align-top">
                    <p class="font-bold text-[12px] uppercase">${flightNo}</p>
                    <p class="font-bold">ECONOMY</p>
                  </td>
                  <td class="p-3 align-top">
                    <p class="font-bold uppercase text-[12px]">${booking.details?.from || 'Origin'}</p>
                    <p class="font-bold">${depTime} <span class="font-normal text-gray-600">${dateStr}</span></p>
                  </td>
                  <td class="p-3 align-top">
                    <p class="font-bold uppercase text-[12px]">${booking.details?.to || 'Destination'}</p>
                    <p class="font-bold">${arrTime} <span class="font-normal text-gray-600">${dateStr}</span></p>
                  </td>
                  <td class="p-3 align-top border-l border-gray-200 text-blue-600 font-medium">
                    2h 10m / Non-Stop
                  </td>
                  <td class="p-3 align-top border-l border-gray-200 font-medium capitalize">
                    Confirmed
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Passenger Details -->
          <div class="border-t-2 border-gray-300">
            <div class="bg-gray-200 px-3 py-1.5 flex flex-wrap justify-between items-center text-[10px] font-bold gap-2">
              <span class="uppercase">Passenger Details</span>
            </div>
            <table class="w-full text-left text-[11px] table-fixed">
              <thead class="border-b border-gray-200 bg-white">
                <tr>
                  <th class="py-2 px-3 font-normal text-gray-500 w-1/4 border-r border-gray-200">PNR</th>
                  <th class="py-2 px-3 font-normal text-gray-500 w-1/2 border-r border-gray-200">Passenger / Baggage Details</th>
                  <th class="py-2 px-3 font-normal text-gray-500 w-[12.5%] border-r border-gray-200">Seat</th>
                  <th class="py-2 px-3 font-normal text-gray-500 w-[12.5%] text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 bg-white">
                ${passengersHTML}
              </tbody>
            </table>
          </div>

        </div>

        <div class="text-[10px] text-gray-500 mt-4 text-center">
          <p class="font-bold mb-1">IMPORTANT INFORMATION</p>
          <p>1. This is an E-Ticket. Passengers must carry a valid photo ID and this E-Ticket to enter the airport.</p>
        </div>
        
      </div>
    </body>
    </html>
  `;

  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Set content and wait for network idle to ensure tailwind loads
    await page.setContent(htmlContent, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500)); // Wait for tailwind CDN
    
    
    const pdfBuffer = await page.pdf({ 
      format: 'A4', 
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '0', right: '0' }
    });
    
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

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
  await sendEmail(to, `Booking Confirmed: E-Ticket & Tax Invoice - PNR: ${pnr}`, getBaseTemplate('TrippeChalo', 'Booking Confirmation', body, 620), "TrippeChalo Bookings", attachments);
};

export const sendCancellationEmail = async (to: string, name: string, pnr: string, refundAmount: number) => {
  const body = `
    <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Dear ${name},</p>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 20px 0; line-height: 1.5;">Your cancellation request has been processed successfully.</p>
    <div style="background-color: #fef2f2; padding: 20px; border-radius: 12px; border: 1px solid #fecaca; margin-bottom: 25px;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;"><strong>Airline PNR:</strong> ${pnr}</p>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;"><strong>Status:</strong> Cancelled</p>
      <p style="margin: 0; font-size: 14px; color: #475569;"><strong>Refund Amount:</strong> <span style="color: #059669; font-weight: bold;">₹${refundAmount.toLocaleString('en-IN')}</span> (Credited to Wallet)</p>
    </div>
    <p style="color: #64748b; font-size: 14px; margin: 0; line-height: 1.5;">The refund amount has been added to your TrippeChalo B2B wallet.</p>
  `;
  await sendEmail(to, `Booking Cancelled - PNR: ${pnr}`, getBaseTemplate('TrippeChalo', 'Booking Cancellation', body), "TrippeChalo Support");
};
