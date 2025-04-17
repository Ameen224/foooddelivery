require("dotenv").config(); // Load .env variables
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongodb-session")(session);
const cookieParser = require("cookie-parser");  // Ensure cookie-parser is imported
const path = require("path");
const connectDB = require("./config/db");

const app = express();

// Connect to MongoDB
connectDB();

// Session Store
const store = new MongoStore({
  uri: process.env.MONGO_URI,
  collection: "sessions",
});

// Middleware
app.use(cookieParser());  // Ensure cookie-parser is placed before session middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // Serve static files

// GLOBAL SESSION CONFIGURATION - Use this one configuration for all routes
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key", // Use environment variable
    resave: false,
    saveUninitialized: false, // Changed to false for better security
    cookie: { 
      secure: process.env.NODE_ENV === 'production', // Secure in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true // Better security
    },
    store: store,
  })
);


// Set EJS as View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); // Set views directory

// Routes admin
app.use("/admin", require("./routes/adminroutes"));

// Routes vendor
app.use("/vendor", require("./routes/vendorroutes"));

// Routes user
app.use("/user",require("./routes/userroutes"))

// Routes delivery
app.use("/delivery", require("./routes/deliveryroutes"));


// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
