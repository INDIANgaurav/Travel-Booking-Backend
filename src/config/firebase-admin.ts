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
  } else {
    console.warn('firebase-service-account.json not found. Firebase Admin not initialized.');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
}

