const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const mongoose = require("mongoose");
const nodemailer = require('nodemailer');


const Vendor = require("../models/vendor");
const Product = require("../models/product");
const Category = require("../models/category");
const order=require("../models/order")
const VendorOrder = require("../models/vendorOrders");
const cloudinary = require("../config/cloudinary"); // Import Cloudinary config
const delivery= require("../models/delivery-partner")
const { log } = require("util");

const router = express.Router();



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
    const { restaurantName, email, password, confirmPassword } = req.body;
    
    if (!restaurantName || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Please fill in all required fields." });
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



// Vendor authentication middleware
const isVendorAuthenticated = (req, res, next) => {
  console.log("Vendor Session Data:", req.session.vendor);
  
  if (!req.session?.vendor || !req.session.vendor.id) {
      console.log("Vendor not authenticated - redirecting to login");
      
      // Return JSON for API requests
      if (req.headers.accept && req.headers.accept.includes("application/json")) {
          return res.status(401).json({ error: "Unauthorized" });
      }
      
      return res.redirect('/vendor/login');
  }
  
  next();
};



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


  // CONSISTENT SESSION FORMAT - Store vendor data under vendor key
  req.session.vendor = {
      id: vendor._id.toString(),
      name: vendor.restaurantName || vendor.name,
      email: vendor.email,
      role: "vendor"
  };
  
  req.session.save(err => {
      if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Session error" });
      }
      res.status(200).json({ 
          message: "Login successful", 
          redirect: "/vendor/home" 
      });
  });
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
router.get("/home",isVendorAuthenticated, async (req, res) => {
  if (!req.session.vendor.id) {
    // If request is from API (JSON expected), return 401
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect("/vendor/login"); // Otherwise, redirect
  }

  try {
    const products = await Product.find({ vendorId: req.session.vendor.id });
    



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
router.get("/profile",isVendorAuthenticated, async (req, res) => {
  try {
    if (!req.session.vendor.id) {
      return res.status(401).redirect("/vendor/login");
    }
    
    const vendor = await Vendor.findById(new mongoose.Types.ObjectId(req.session.vendor.id));
    if (!vendor) return res.status(404).send("Vendor not found");

    res.render("vendor/vendorprofile", { vendor });
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// Update Vendor Profile
router.post("/update-profile", async (req, res) => {
  try {
    const { restaurantName, phoneNumber, location } = req.body;
    
    if (!restaurantName || !phoneNumber) {
      return res.status(400).json({ message: "Restaurant name and phone number are required" });
    }

    if (!req.session.vendor.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Prepare the update object
    const updateData = {
      restaurantName,
      phoneNumber
    };

    // Add location data if provided
    if (location && (location.latitude || location.longitude)) {
      updateData.location = {
        latitude: location.latitude || null,
        longitude: location.longitude || null
      };
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(
      req.session.vendor.id,
      updateData,
      { new: true }
    );

    if (!updatedVendor) return res.status(404).json({ message: "Vendor not found" });
    res.json({ message: "Profile updated successfully", vendor: updatedVendor });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

/**
 * ==========================
 * Vendor Product Routes
 * ==========================
 */

// Render Add Product Page
router.get("/add",isVendorAuthenticated, async(req, res) => {
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
  if (!req.session.vendor.id) return res.status(403).json({ message: "Unauthorized" });

  try {
    console.log("Received Request Body:", req.body);
    console.log("Uploaded Files:", req.files);

    let { product_name, category, product_description, product_price, stock, status, second_price, isVeg,order } = req.body;

    // Ensure category is an array
    if (!Array.isArray(category)) {
      category = [category]; // Convert to array if it's a single category
    }

    // Validate category IDs
    for (const categoryId of category) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID detected" });
      }
    }

    // Check for required fields
    if (!product_name || !product_description || !product_price || !stock || !status || !isVeg) {
      return res.status(400).json({ message: "Missing required product information" });
    }

    // Check if images were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one product image is required" });
    }

    const imageUrls = req.files.map(file => file.path);

    const newProduct = new Product({
      name: product_name,
      category: category, // Now properly handling multiple categories
      description: product_description,
      price: product_price,
      stock: parseInt(stock, 10), // Ensure stock is a number
      status: status,
      secondprice: second_price || 0, // Match frontend field name
      isVeg: isVeg === "true", // Convert string to boolean
      images: imageUrls,
      order:order,
      vendorId: req.session.vendor.Id,
    });

    await newProduct.save();
    res.status(200).json({ message: "Product added successfully!", product: newProduct });
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ message: "Server error occurred while adding product" });
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

//product edit  page
router.get('/edit-product/:id', async (req, res) => {
  try {
      const product = await Product.findById(req.params.id);
      if (!product) {
          return res.status(404).send("Product not found");
      }

      const categories = await Category.find(); // Fetch all categories

      res.render('vendor/vendorproductedit', { product, categories });
  } catch (error) {
      console.error(error);
      res.status(500).send("Server Error");
  }
});


// Edit Product Route
router.put("/api/products/edit/:id", upload.array("product_images", 5), async (req, res) => {
  try {
    const productId = req.params.id;

    // Validate Product ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log("Invalid Product ID:", productId);
      return res.status(400).json({ error: "Invalid Product ID" });
    }

    // Find existing product
    let product = await Product.findById(productId);
    if (!product) {
      console.log("Product not found:", productId);
      return res.status(404).json({ error: "Product not found" });
    }

    console.log("Existing Product:", product);

    // Extract form data
    const { product_name, category, product_description, product_price, discount_price, stock, status, order,isVeg, deleted_images } = req.body;
    console.log("Parsed Request Fields:", req.body);

    // Handle Image Deletions
    if (deleted_images) {
      try {
        const deletedImagesArray = JSON.parse(deleted_images);
        console.log("Images to delete:", deletedImagesArray);

        // Delete images from Cloudinary
        for (const imageUrl of deletedImagesArray) {
          const publicId = imageUrl.split('/').pop().split('.')[0]; // Extract public ID
          console.log("Deleting image:", publicId);

          await cloudinary.uploader.destroy(publicId);
        }

        // Remove deleted images from product
        product.images = product.images.filter(img => !deletedImagesArray.includes(img));
      } catch (error) {
        console.error("Error parsing deleted_images:", error);
      }
    }

    // Handle New Image Uploads (CloudinaryStorage already uploads files)
    if (req.files && req.files.length > 0) {
      console.log(`Uploading ${req.files.length} new images...`);
      const newImageUrls = req.files.map(file => file.path); // Cloudinary auto-uploads & returns URLs
      console.log("Uploaded Image URLs:", newImageUrls);
      product.images = [...product.images, ...newImageUrls];
    } else {
      console.log("No new images uploaded.");
    }

    // Validate required fields
    if (!product_name || !category || !product_description || !product_price) {
      console.log("Missing required fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Update product fields
    product.name = product_name;
    product.category = category;
    product.description = product_description;
    product.price = parseFloat(product_price);
    product.secondprice = discount_price ? parseFloat(discount_price) : product.secondprice;
    product.stock = parseInt(stock);
    product.status = status;
    product.isVeg = isVeg === "true";
    product.updatedAt = new Date();
    product.order = order;

    // Save updated product
    await product.save();

    console.log("Product updated successfully!");

    // Send success response
    res.status(200).json({
      message: "Product updated successfully!",
      product: {
        _id: product._id,
        name: product.name,
        category: product.category,
        description: product.description,
        price: product.price,
        secondprice: product.secondprice,
        stock: product.stock,
        status: product.status,
        isVeg: product.isVeg,
        images: product.images,
        updatedAt: product.updatedAt
      }
    });

  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Server Error", message: error.message });
  }
});

// Error Handling Middleware for Multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File size too large. Max 5MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ error: "Too many files. Max 5." });
    }
  }
  next(error);
});



// GET Orders for Vendor
router.get("/orders",isVendorAuthenticated, async (req, res) => {
  try {
    const vendorId = req.session.vendor.id;
    let orders = await VendorOrder.find({ vendorId })
      .populate("orderDetails.customerId")
      .populate("items.productId");
    
    // Process orders to ensure null values don't cause errors
    orders = orders.map(order => {
      // Make sure each order has the required properties
      if (!order.orderDetails) {
        order.orderDetails = {};
      }
      
      // If customerId is null or not populated, provide a default
      if (!order.orderDetails.customerId) {
        order.orderDetails.customerId = { name: 'Unknown Customer' };
      }
      
      // Ensure other required properties exist
      if (!order.orderDetails.paymentStatus) {
        order.orderDetails.paymentStatus = 'Unknown';
      }
      
      if (!order.orderDetails.orderStatus) {
        order.orderDetails.orderStatus = 'Unknown';
      }
      
      return order;
    });
    
    res.render("vendor/vendororder", { orders });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});


// Route to update order status (approve/decline)
router.post("/orders/update", async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const vendorId = req.session.vendor.id;
    
    // Validate inputs
    if (!orderId || !status) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID and status are required" 
      });
    }
    
    // Ensure status is valid
    const validStatuses = ["Processing", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid status" 
      });
    }
    
    // Find and update the order
    const order = await VendorOrder.findOneAndUpdate(
      { _id: orderId, vendorId: vendorId },
      { "orderDetails.orderStatus": status },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found or you don't have permission to update it" 
      });
    }
    
    res.json({ 
      success: true, 
      message: `Order status updated to ${status}` 
    });
    
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update order status" 
    });
  }
});


// Route to get available delivery partners
router.get("/delivery-partners/available", async (req, res) => {
  try {
    // Find all delivery partners who are available and not blocked
    const availablePartners = await require("../models/delivery-partner").find({
      available: true,
      isBlocked: false
    });

    res.json(availablePartners);
  } catch (error) {
    console.error("Error fetching available delivery partners:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch delivery partners" 
    });
  }
});

// Route to assign delivery partner to an order
router.post("/orders/assign-delivery", async (req, res) => {
  try {
    const { orderId, deliveryPartnerId } = req.body;
    
    // Validate inputs
    if (!orderId || !deliveryPartnerId) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID and delivery partner ID are required" 
      });
    }

    // Find the order
    const order = await VendorOrder.findById(orderId).populate('orderDetails.customerId');
        if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    // Find the delivery partner
    const deliveryPartner = await delivery.findById(deliveryPartnerId);
    if (!deliveryPartner) {
      return res.status(404).json({ 
        success: false, 
        message: "Delivery partner not found" 
      });
    }

    // Ensure the delivery partner is available
    if (!deliveryPartner.available) {
      return res.status(400).json({ 
        success: false, 
        message: "This delivery partner is no longer available" 
      });
    }

    // Update the order with the delivery partner and change status to "Out for Delivery"
    await VendorOrder.findByIdAndUpdate(
      orderId,
      {
        deliveryPartner: deliveryPartnerId,
        "orderDetails.orderStatus": "Out for Delivery"
      }
    );

    // Send email notification to user
    const userEmail = order.orderDetails.customerId.email; // Assuming email is on the customer object
    const orderNumber = order.orderNumber || order._id; // Use order number or ID
    
    // Configure and send email using Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail', // e.g., 'gmail'
      auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS    
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: `Your Order #${orderNumber} is Out for Delivery`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your Order is On the Way!</h2>
          <p>Good news! Your order #${orderNumber} has been picked up by our delivery partner and is on its way to you.</p>
          <p>Estimated delivery time: Within the next few hours</p>
          <p>Delivery Partner: ${deliveryPartner.name}</p>
          <p>Thank you for shopping with us!</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      success: true, 
      message: "Delivery partner assigned successfully and customer notified" 
    });
  } catch (error) {
    console.error("Error assigning delivery partner:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to assign delivery partner" 
    });
  }
});
module.exports = router;
