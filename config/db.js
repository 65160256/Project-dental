// config/db.js
const mysql = require('mysql2/promise');
const dns = require('dns').promises;
require('dotenv').config();

// Helper function to resolve host to IPv4 address
async function resolveIPv4(hostname) {
  try {
    const addresses = await dns.resolve4(hostname);
    return addresses[0];
  } catch (error) {
    console.warn(`Failed to resolve IPv4 for ${hostname}, using original hostname`);
    return hostname;
  }
}

// Auto-detect if running inside Docker or locally
async function getDbHost() {
  let dbHost = process.env.DB_HOST;
  
  // Always resolve 'mysql' to IPv4 address to avoid IPv6 issues
  if (dbHost === 'mysql') {
    dbHost = await resolveIPv4('mysql');
  }
  
  return dbHost;
}

// Create connection pool with resolved host
const poolPromise = getDbHost().then(dbHost => {
  console.log(`📡 Database host resolved to: ${dbHost}`);
  
  return mysql.createPool({
    host: dbHost,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 60000,
    socketPath: null,
    enableKeepAlive: true,
  });
});

// Export wrapped pool
module.exports = {
  async execute(...args) {
    const pool = await poolPromise;
    return pool.execute(...args);
  },
  async query(...args) {
    const pool = await poolPromise;
    return pool.query(...args);
  },
  async getConnection(...args) {
    const pool = await poolPromise;
    return pool.getConnection(...args);
  }
};
