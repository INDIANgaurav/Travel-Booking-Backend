import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Flight, Hotel, Bus } from '../modules/inventory/inventory.model';

dotenv.config();

const dummyFlights = [
  { airline: 'IndiGo', flightNumber: '6E-101', from: 'DEL', to: 'BOM', departureTime: new Date(Date.now() + 86400000), arrivalTime: new Date(Date.now() + 93600000), price: 4500, duration: '2h 00m', stops: 0 },
  { airline: 'Air India', flightNumber: 'AI-202', from: 'DEL', to: 'BOM', departureTime: new Date(Date.now() + 100000000), arrivalTime: new Date(Date.now() + 108000000), price: 5200, duration: '2h 15m', stops: 0 },
  { airline: 'Vistara', flightNumber: 'UK-303', from: 'DEL', to: 'BOM', departureTime: new Date(Date.now() + 120000000), arrivalTime: new Date(Date.now() + 127200000), price: 6100, duration: '2h 00m', stops: 0 },
  { airline: 'SpiceJet', flightNumber: 'SG-404', from: 'DEL', to: 'BLR', departureTime: new Date(Date.now() + 86400000), arrivalTime: new Date(Date.now() + 95400000), price: 3800, duration: '2h 30m', stops: 0 },
  { airline: 'Akasa Air', flightNumber: 'QP-505', from: 'BOM', to: 'BLR', departureTime: new Date(Date.now() + 86400000), arrivalTime: new Date(Date.now() + 91800000), price: 3200, duration: '1h 30m', stops: 0 },
];

const dummyHotels = [
  { name: 'Taj Mahal Palace', location: 'Mumbai', rating: 5, pricePerNight: 25000, amenities: ['Pool', 'Spa', 'Sea View'], imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1000' },
  { name: 'ITC Maurya', location: 'New Delhi', rating: 5, pricePerNight: 18000, amenities: ['Pool', 'Gym', 'Restaurant'], imageUrl: 'https://images.unsplash.com/photo-1551882547-ff40c0d509af?q=80&w=1000' },
  { name: 'The Leela Palace', location: 'Bengaluru', rating: 5, pricePerNight: 22000, amenities: ['Spa', 'Lounge', 'Pool'], imageUrl: 'https://images.unsplash.com/photo-1542314831-c6a4d14d8c85?q=80&w=1000' },
  { name: 'Lemon Tree Premier', location: 'Mumbai', rating: 4, pricePerNight: 6500, amenities: ['Gym', 'Free WiFi'], imageUrl: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=1000' },
  { name: 'Radisson Blu', location: 'New Delhi', rating: 4, pricePerNight: 8000, amenities: ['Pool', 'Bar'], imageUrl: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?q=80&w=1000' },
];

const dummyBuses = [
  { operator: 'VRL Travels', from: 'Mumbai', to: 'Pune', departureTime: new Date(Date.now() + 86400000), arrivalTime: new Date(Date.now() + 97200000), price: 800, busType: 'A/C Sleeper' },
  { operator: 'Neeta Travels', from: 'Mumbai', to: 'Pune', departureTime: new Date(Date.now() + 90000000), arrivalTime: new Date(Date.now() + 100800000), price: 650, busType: 'Volvo Semi Sleeper' },
  { operator: 'Kallada Travels', from: 'Bengaluru', to: 'Chennai', departureTime: new Date(Date.now() + 86400000), arrivalTime: new Date(Date.now() + 108000000), price: 1200, busType: 'A/C Sleeper' },
  { operator: 'SRS Travels', from: 'Bengaluru', to: 'Hyderabad', departureTime: new Date(Date.now() + 86400000), arrivalTime: new Date(Date.now() + 122400000), price: 1500, busType: 'Non A/C Sleeper' },
  { operator: 'Orange Tours', from: 'Hyderabad', to: 'Vijayawada', departureTime: new Date(Date.now() + 86400000), arrivalTime: new Date(Date.now() + 104400000), price: 900, busType: 'A/C Seater' },
];

async function seedData() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/travelbooking';
    console.log(`Connecting to ${mongoUri}`);
    await mongoose.connect(mongoUri);

    console.log('Clearing old inventory...');
    await Flight.deleteMany({});
    await Hotel.deleteMany({});
    await Bus.deleteMany({});

    console.log('Seeding Flights...');
    await Flight.insertMany(dummyFlights);

    console.log('Seeding Hotels...');
    await Hotel.insertMany(dummyHotels);

    console.log('Seeding Buses...');
    await Bus.insertMany(dummyBuses);

    console.log('Inventory seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seedData();
