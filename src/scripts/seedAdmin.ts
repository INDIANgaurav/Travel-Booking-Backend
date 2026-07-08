import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db';
import User from '../modules/users/user.model';

dotenv.config();

const seedAdmin = async () => {
  try {
    await connectDB();

    const adminExists = await User.findOne({ email: 'admin@travel.com' });

    if (adminExists) {
      console.log('Super Admin already exists!');
      process.exit();
    }

    await User.create({
      name: 'Super Admin',
      email: 'admin@travel.com',
      phone: '1234567890',
      password: 'adminpassword123',
      role: 'SUPER_ADMIN',
      isApproved: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    console.log('Super Admin created successfully! (Email: admin@travel.com, Password: adminpassword123)');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
};

seedAdmin();
