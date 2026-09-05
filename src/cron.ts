import SeatHold from './modules/seriesFare/seatHold.model';
import SeriesFare from './modules/seriesFare/seriesFare.model';

export const startCronJobs = () => {
  // Run every 1 minute
  setInterval(async () => {
    try {
      // Find active holds that have expired
      const expiredHolds = await SeatHold.find({
        status: 'ACTIVE',
        expiresAt: { $lt: new Date() }
      });

      for (const hold of expiredHolds) {
        hold.status = 'EXPIRED';
        await hold.save();
        
        // Return the seats back to inventory
        await SeriesFare.updateOne(
          { _id: hold.flightId },
          { $inc: { availableSeats: hold.paxCount } }
        );
        console.log(`Cron: Released ${hold.paxCount} seats for expired hold ${hold._id}`);
      }
    } catch (error) {
      console.error('Error in SeatHold cleanup cron:', error);
    }
  }, 60 * 1000);
};
