/**
 * ==============================================================================
 * MediMate - Database Configuration (Mongoose + MongoDB Atlas)
 * ==============================================================================
 * Handles the secure connection lifecycle to MongoDB Atlas.
 * Configures DNS resolver fallback to prevent Windows SRV lookup timeouts.
 * ==============================================================================
 */

const mongoose = require('mongoose');
const dns = require('dns');

// Configure public DNS servers to resolve MongoDB Atlas SRV records reliably on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
  // Non-fatal if environment restricts custom DNS
  console.warn('[Database] Using default system DNS resolver.');
}

/**
 * Connect to MongoDB Atlas with automatic retry
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB(retries = 5, delay = 2000) {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in the environment variables. Please check your .env file.');
  }

  // Configure Mongoose strict query mode
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });

      console.log(`[Database] Connected successfully to MongoDB Atlas (${conn.connection.name})`);
      return conn;
    } catch (error) {
      console.error(`[Database] Connection attempt ${attempt}/${retries} error:`, error.message);
      if (attempt === retries) {
        throw error;
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Check connection status
 * @returns {boolean}
 */
function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('[Database] Connection closed due to application termination (SIGINT).');
  }
  process.exit(0);
});

module.exports = { connectDB, isDBConnected };
