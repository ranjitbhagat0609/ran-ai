const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "crossover.proxy.rlwy.net",
  user: "root",
  password: "xdsFURVZDISdibIMIKdUdTvhkZsIkPxY",
  database: "railway",
  port: 41008
});

db.connect((err) => {
  if (err) {
    console.error("❌ DB connection failed:", err);
  } else {
    console.log("✅ Connected to Railway MySQL");
  }
});

module.exports = db;
