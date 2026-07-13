import { initializeApp, cert } from 'firebase-admin/app';

// Initialize Firebase Admin based on environment variable
// You can download the service account JSON from Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
// Then base64 encode the JSON or set it directly in the .env file

import fs from 'fs';
import path from 'path';

// Read the service account JSON file
try {
  const serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount)
    });
    console.log('Firebase Admin initialized successfully from JSON file');
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const decodedKey = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decodedKey);
    initializeApp({
      credential: cert(serviceAccount)
    });
    console.log('Firebase Admin initialized successfully from Base64 ENV');
  } else {
    console.warn('Firebase credentials not found (neither JSON file nor Base64 env var). Firebase Admin not initialized.');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
}

