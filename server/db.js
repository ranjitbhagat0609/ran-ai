const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",        // apna MySQL username
  password: "12345",        // apna password (agar hai)
  database: "ranai"    // ✅ yaha tumhara DB name
});

db.connect((err) => {
  if (err) {
    console.error("❌ DB connection failed:", err);
  } else {
    console.log("✅ MySQL Connected");
  }
});

module.exports = db;
