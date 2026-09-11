import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTP = async (to: string, otp: string, expiryMinutes: number) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ EMAIL_USER or EMAIL_PASS not set in .env. Skipping actual email send.');
    console.log(`[Simulated Email] To: ${to}, OTP: ${otp}`);
    return;
  }

  const mailOptions = {
    from: `"TrippeChalo Security" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your TrippeChalo Verification Code',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 0; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #f0f0f0;">
        
        <!-- Header -->
        <div style="background: #1a3673; padding: 30px 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 0.5px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
            <span style="color: #ffffff;">Trippe</span><span style="color: #60a5fa;">Chalo</span>
          </h1>
          <p style="color: #a3b8e8; margin: 8px 0 0 0; font-size: 14px;">Secure Verification</p>
        </div>

        <!-- Body -->
        <div style="padding: 40px 30px;">
          <p style="color: #334155; font-size: 16px; margin: 0 0 10px 0; font-weight: 500;">Hello,</p>
          <p style="color: #64748b; font-size: 15px; margin: 0 0 25px 0; line-height: 1.5;">To complete your verification, please use the One-Time Password (OTP) below:</p>
          
          <!-- OTP Box -->
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 12px; border: 2px dashed #cbd5e1; margin-bottom: 25px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 38px; font-weight: 800; letter-spacing: 8px;">${otp}</h1>
          </div>
          
          <p style="color: #64748b; font-size: 14px; margin: 0; text-align: center;">
            This code will expire in <strong style="color: #ef4444;">${expiryMinutes} minutes</strong>.
          </p>
          <p style="color: #64748b; font-size: 14px; margin: 10px 0 0 0; text-align: center;">
            Please do not share this code with anyone for your security.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 25px 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0 0 5px 0;">If you didn't request this code, you can safely ignore this email.</p>
          <p style="color: #64748b; font-size: 12px; font-weight: 600; margin: 15px 0 0 0;">&copy; ${new Date().getFullYear()} TrippeChalo India Private Limited.</p>
          <p style="color: #94a3b8; font-size: 11px; margin: 5px 0 0 0;">All rights reserved.</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};
