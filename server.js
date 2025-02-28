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

app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true if using HTTPS
    store: store, // Save session to MongoDB
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

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
