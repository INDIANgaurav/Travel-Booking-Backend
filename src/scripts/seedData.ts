import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db';
import Destination from '../modules/tours/destination.model';
import Offer from '../modules/cms/offer.model';
import TourPackage from '../modules/tours/tour.model';
import Flight from '../modules/inventory/flight.model';

dotenv.config();

const AIRLINES = [
  { name: 'Akasa Air', logo: 'https://imgak.mmtcdn.com/flights/assets/media/dt/common/icons/QP.png?v=18' },
  { name: 'SpiceJet', logo: 'https://imgak.mmtcdn.com/flights/assets/media/dt/common/icons/SG.png?v=18' },
  { name: 'IndiGo', logo: 'https://imgak.mmtcdn.com/flights/assets/media/dt/common/icons/6E.png?v=18' },
  { name: 'Air India', logo: 'https://imgak.mmtcdn.com/flights/assets/media/dt/common/icons/AI.png?v=18' },
  { name: 'Vistara', logo: 'https://imgak.mmtcdn.com/flights/assets/media/dt/common/icons/UK.png?v=18' }
];

const seedData = async () => {
  try {
    await connectDB();

    console.log('Clearing old dummy data...');
    await Destination.deleteMany({});
    await Offer.deleteMany({});
    await TourPackage.deleteMany({});
    await Flight.deleteMany({});

    // Generate Flights DEL -> BOM
    const flights = [];
    const baseDate = new Date();
    
    const cabinClasses = ['Economy/ Premium Economy', 'Premium Economy', 'Business Class', 'First Class'];
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      for (let i = 0; i < 20; i++) { // 20 flights per day
        const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
        const cabinClass = cabinClasses[Math.floor(Math.random() * cabinClasses.length)];
        
        let priceMultiplier = 1;
        if (cabinClass === 'Premium Economy') priceMultiplier = 1.5;
        if (cabinClass === 'Business Class') priceMultiplier = 3;
        if (cabinClass === 'First Class') priceMultiplier = 5;

        const price = Math.floor((Math.random() * 5000) + 4000) * priceMultiplier; 
        const duration = Math.floor(Math.random() * 60) + 120;
        
        const hour = Math.floor(Math.random() * 24);
        const min = Math.floor(Math.random() * 60);
        
        const depDate = new Date(baseDate);
        depDate.setDate(depDate.getDate() + dayOffset);
        depDate.setHours(hour, min, 0, 0);
        
        const arrDate = new Date(depDate);
        arrDate.setMinutes(arrDate.getMinutes() + duration);

        const stops = Math.random() > 0.7 ? (Math.random() > 0.5 ? 2 : 1) : 0;
        const availableSeats = Math.floor(Math.random() * 100) + 1;

        flights.push({
          airline: airline.name,
          airlineLogo: airline.logo,
          flightNumber: `${airline.name.substring(0,2).toUpperCase()}-${Math.floor(Math.random() * 9000) + 1000}`,
          departureCity: 'New Delhi',
          departureAirportCode: 'DEL',
          arrivalCity: 'Mumbai',
          arrivalAirportCode: 'BOM',
          departureTime: depDate,
          arrivalTime: arrDate,
          durationMinutes: duration,
          price,
          stops,
          availableSeats,
          cabinClass
        });
        
        // Return flight BOM -> DEL
        const retDepDate = new Date(depDate);
        retDepDate.setDate(retDepDate.getDate() + 2); // 2 days later
        const retArrDate = new Date(retDepDate);
        retArrDate.setMinutes(retArrDate.getMinutes() + duration);
        
        flights.push({
          airline: airline.name,
          airlineLogo: airline.logo,
          flightNumber: `${airline.name.substring(0,2).toUpperCase()}-${Math.floor(Math.random() * 9000) + 1000}`,
          departureCity: 'Mumbai',
          departureAirportCode: 'BOM',
          arrivalCity: 'New Delhi',
          arrivalAirportCode: 'DEL',
          departureTime: retDepDate,
          arrivalTime: retArrDate,
          durationMinutes: duration,
          price,
          stops,
          availableSeats,
          cabinClass
        });
      }
    }

    await Flight.insertMany(flights);
    console.log(`Seeded ${flights.length} flights...`);

    console.log('Seeding Destinations...');
    const goa = await Destination.create({
      name: 'Goa',
      slug: 'goa',
      description: 'The party capital of India with beautiful beaches.',
      imageUrl: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=80&w=2000',
      country: 'India',
      city: 'Goa'
    });

    const maldives = await Destination.create({
      name: 'Maldives',
      slug: 'maldives',
      description: 'Tropical paradise in the Indian Ocean.',
      imageUrl: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?q=80&w=2000',
      country: 'Maldives',
      city: 'Male'
    });

    console.log('Seeding Offers...');
    await Offer.create({
      title: 'Flight Offer',
      description: 'Up to 12% OFF on Domestic Flights',
      code: 'FLY12',
      type: 'FLIGHT'
    });
    
    await Offer.create({
      title: 'Summer Getaway',
      description: 'Flat ₹2000 OFF on Tour Packages',
      code: 'SUMMER2K',
      type: 'PACKAGE'
    });

    console.log('Seeding Tour Packages...');
    await TourPackage.create({
      title: '4 Days Enchanting Goa',
      slug: '4-days-enchanting-goa',
      destination: goa._id,
      description: 'Experience the magic of Goa with our exclusive 4-day package.',
      durationDays: 4,
      durationNights: 3,
      basePrice: 12999,
      b2bPrice: 10999,
      gallery: ['https://images.unsplash.com/photo-1512343879784-a960bf40e7f2'],
      inclusions: ['Hotel Stay', 'Breakfast', 'Airport Transfer'],
      exclusions: ['Flights', 'Lunch/Dinner'],
      itinerary: [
        { day: 1, title: 'Arrival', description: 'Arrive in Goa and check into the hotel.' },
        { day: 2, title: 'North Goa Tour', description: 'Visit Baga, Calangute, and Fort Aguada.' }
      ]
    });

    console.log('Dummy Data Seeded Successfully! 🎉');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
};

seedData();
