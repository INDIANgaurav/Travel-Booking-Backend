import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Make sure to add these to your .env file
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dummy_cloud',
  api_key: process.env.CLOUDINARY_API_KEY || 'dummy_key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'dummy_secret'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'TrippeChalo_hotels',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  } as any
});

export const upload = multer({ storage: storage });
