import mongoose from "mongoose";

/**
 * Database Connection Configuration
 * Using MongoDB with Mongoose
 */

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DATABASE_URL || "mongodb://localhost:27017/crm_db", {
      // MongoDB connection options
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on("error", (err) => {
      console.error(`❌ MongoDB connection error: ${err}`);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("⚠️  MongoDB disconnected");
    });

  } catch (error: any) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed through app termination");
  process.exit(0);
});
