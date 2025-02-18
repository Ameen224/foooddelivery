const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const mongoose = require("mongoose");

const Vendor = require("../models/vendor");
const Product = require("../models/Product");
const Category = require("../models/category");
const cloudinary = require("../config/cloudinary"); // Import Cloudinary config

const router = express.Router();

/**
 * ==========================
 * Session Configuration
 * ==========================
 */
router.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 2 * 60 * 60 * 1000 }, // 2 hours
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI, // Use your MongoDB URI
      collectionName: "sessions",
    }),
  })
);

/**
 * ==========================
 * Multer Configuration
 * ==========================
 */
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "products", // Cloudinary folder
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});
const upload = multer({ storage });

// Middleware to parse JSON
router.use(express.json());

/**
 * ==========================
 * Vendor Authentication Routes
 * ==========================
 */

// Vendor Login Page
router.get("/login", (req, res) => {
  res.render("vendor/vendorlogin");
});

// Vendor Signup
router.post("/signup", async (req, res) => {
  try {
    const { restaurantName, restaurantAddress, email, password, confirmPassword } = req.body;
    
    if (!restaurantName || !restaurantAddress || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Please fill in all fields." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ success: false, message: "Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newVendor = new Vendor({
      restaurantName,
      restaurantAddress,
      email,
      password: hashedPassword,
      isApproved: false, // Requires admin approval
    });

    await newVendor.save();
    return res.status(201).json({ success: true, message: "Vendor account created. Waiting for admin approval." });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// Vendor Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const vendor = await Vendor.findOne({ email });

    if (!vendor || !(await bcrypt.compare(password, vendor.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!vendor.isApproved) {
      return res.status(401).json({ message: "Vendor is not approved" });
    }

    if (vendor.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked. Contact admin." });
    }

    req.session.vendorId = vendor._id.toString();
    res.status(200).json({ message: "Login successful", redirect: "/vendor/home" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * ==========================
 * Vendor Dashboard Routes
 * ==========================
 */

// Vendor Home
router.get("/home", async (req, res) => {
  if (!req.session.vendorId) {
    // If request is from API (JSON expected), return 401
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect("/vendor/login"); // Otherwise, redirect
  }

  try {
    const products = await Product.find({ vendorId: req.session.vendorId });
    



    // If request expects JSON, return JSON
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json(products);
    }

    // Otherwise, render EJS
    res.render("vendor/vendorhome", { vendor: req.session.vendor, products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Server error");
  }
});


// Vendor Profile
router.get("/profile", async (req, res) => {
  try {
    if (!req.session.vendorId) {
      return res.status(401).redirect("/vendor/login");
    }
    
    const vendor = await Vendor.findById(new mongoose.Types.ObjectId(req.session.vendorId));
    if (!vendor) return res.status(404).send("Vendor not found");

    res.render("vendor/vendorprofile", { vendor });
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// Update Vendor Profile
router.post("/update-profile", async (req, res) => {
  try {
    const { restaurantName, restaurantAddress, phoneNumber } = req.body;
    if (!restaurantName || !restaurantAddress || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!req.session.vendorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(
      req.session.vendorId,
      { restaurantName, restaurantAddress, phoneNumber },
      { new: true }
    );

    if (!updatedVendor) return res.status(404).json({ message: "Vendor not found" });
    res.json({ message: "Profile updated successfully", vendor: updatedVendor });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * ==========================
 * Vendor Product Routes
 * ==========================
 */

// Render Add Product Page
router.get("/add", async(req, res) => {
  if (!req.session.vendor) return res.redirect("/vendor/login");
  try {
    const categories= await Category.find()
    res.render("vendor/vendorprosuctadd", { vendor: req.session.vendor ,categories});
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).send("Server Error");
  }
  
});

// Add New Product
router.post("/api/products/add", upload.array("product_images", 5), async (req, res) => {
  if (!req.session.vendorId) return res.status(403).json({ message: "Unauthorized" });

  try {
    const { product_name, category, product_description, product_price } = req.body;
    const imageUrls = req.files.map(file => file.path); // Ensure Cloudinary URLs are retrieved

    console.log("Uploaded Files:", req.files);

    

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const newProduct = new Product({
      name: product_name,
      category: category, // Corrected
      description: product_description,
      price: product_price,
      images: imageUrls,
      vendorId: req.session.vendorId,
    });

    await newProduct.save();
    res.json({ message: "Product added successfully!", product: newProduct });
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ message: "Server error" });
  }
});


/// Delete a product
router.delete("/delete-product/:id", async (req, res) => {
  try {
      const deleteproduct = await Product.findByIdAndDelete(req.params.id);
      if (!deleteproduct) {
          return res.status(404).json({ message: "Product not found" });
      }
      res.status(200).json({ message: "Product deleted successfully" });
  } catch (err) {
      console.error("Error deleting product:", err);
      res.status(500).json({ message: "Server error", error: err.message });
  }
});


module.exports = router;
