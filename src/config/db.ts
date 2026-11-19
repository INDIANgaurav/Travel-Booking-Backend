import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI as string, {
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB connection lost. Attempting automatic reconnection...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB connection successfully restored.');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB Connection Error:', err);
    });

  } catch (error: any) {
    console.error(`❌ MongoDB Initial Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
