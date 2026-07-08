const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const promoteUser = async (email) => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const db = mongoose.connection.db;
    const result = await db.collection('users').updateOne(
      { email: email },
      { $set: { role: 'SUPER_ADMIN' } }
    );

    if (result.modifiedCount > 0) {
      console.log(`Successfully promoted ${email} to SUPER_ADMIN`);
    } else {
      console.log(`User ${email} not found or already a SUPER_ADMIN`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    process.exit();
  }
};

const emailArg = process.argv[2];
if (!emailArg) {
  console.log('Please provide an email: node promoteToAdmin.js user@example.com');
  process.exit(1);
}

promoteUser(emailArg);
