const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require('fs');
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const { check, validationResult } = require("express-validator");  // Added express-validator for better input validation

dotenv.config();
const router = express.Router();

const Admin = require("../models/admin");
const Vendor = require("../models/vendor");
const Product = require("../models/product");
const Category = require("../models/category");
const cloudinary = require("../config/cloudinary"); 
const Banner = require("../models/banner");
const contact =require("../models/contact")
const coupon=require("../models/coupon")
const deliverypartner=require("../models/delivery-partner")
const order=require("../models/order")



// Multer Storage Setup for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
      folder: "banners",
      format: async (req, file) => "jpg", // You can specify other formats
      public_id: (req, file) => file.fieldname + "-" + Date.now(),
  },
});

const upload = multer({ storage });



// Admin Login Page
router.get("/login", (req, res) => {
  res.render("admin/adminlogin");
});

// Admin Login API
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email, role: "admin" });
    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not defined" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.cookie("token", token, { httpOnly: true });

    res.status(200).json({ message: "Login successful", redirect: "/admin/home" });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Admin Home Page
router.get("/home", async (req, res) => {
  try {
    const vendor = await Vendor.find({ isApproved: true }); // Fetch only approved vendors
    res.render("admin/adminhome", { vendor });
  } catch (error) {
    console.error("Error fetching vendors:", error);
    res.render("admin/adminhome", { vendor: [] }); // Pass an empty array if there's an error
  }
});


// Fetch Pending Vendors
router.get("/pending-vendors", async (req, res) => {
  try {
    const pendingVendors = await Vendor.find({ isApproved: false });
    res.render("admin/pendingvendor",{ vendor: pendingVendors });
  } catch (err) {
    console.error("Error fetching pending vendors:", err);
    res.status(500).json({ message: "Error fetching pending vendors", error: err.message });
  }
});

// Approve Vendor
router.patch("/approve-vendor/:id", async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    res.status(200).json({ message: `Vendor ${vendor.restaurantName} approved successfully` });
  } catch (err) {
    console.error("Error approving vendor:", err);
    res.status(500).json({ message: "Error approving vendor", error: err.message });
  }
});

// Delete Vendor
router.delete("/delete-vendor/:id", async (req, res) => {
  try {
    const deletedVendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!deletedVendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.status(200).json({ message: "Vendor deleted successfully" });
  } catch (err) {
    console.error("Error deleting vendor:", err);
    res.status(500).json({ message: "Error deleting vendor", error: err.message });
  }
});

// Block Vendor (PATCH instead of PUT)
router.patch("/block-vendor/:id", async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.status(200).json({ message: `Vendor ${vendor.restaurantName} is blocked` });
  } catch (err) {
    console.error("Error blocking vendor:", err);
    res.status(500).json({ message: "Error blocking vendor", error: err.message });
  }
});

// Unblock Vendor (PATCH instead of PUT)
router.patch("/unblock-vendor/:id", async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.status(200).json({ message: `Vendor ${vendor.restaurantName} is unblocked` });
  } catch (err) {
    console.error("Error unblocking vendor:", err);
    res.status(500).json({ message: "Error unblocking vendor", error: err.message });
  }
});

// Fetch all categories
router.get("/category-list", async (req, res) => {
  try {
    const categories = await Category.find();
    
    // Check if JSON is requested (you can use Accept header or query parameter)
    if (req.query.format === 'json' || req.headers.accept.includes('application/json')) {
      return res.json(categories);
    }
    
    // Otherwise render the HTML page
    res.render("admin/category", { category: categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).send({ message: "Failed to fetch categories." });
  }
});


// Add a category with image upload
router.post("/add-category", upload.single("image"), async (req, res) => {
  const { name } = req.body;

  try {
    // Check for duplicate category
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ message: "Category name already exists" });
    }

    // Get Image URL from multer-storage-cloudinary
    const imageUrl = req.file ? req.file.path : "";

    // Create new category
    const newCategory = new Category({ name, image: imageUrl });
    await newCategory.save();

    res.json({ success: true, message: "Category added successfully!" });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


router.get("/get-category/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    res.status(200).json({ success: true, category });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


/// Edit a category
router.put("/edit-category/:id", upload.single("image"), async (req, res) => {
  try {
    console.log("🟢 Edit request received for category ID:", req.params.id);

    const { name, removeImage } = req.body;
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // Remove image if requested
    if (removeImage === "true" && category.image) {
      try {
        const publicId = category.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
        category.image = "";
      } catch (cloudError) {
        console.error("Cloudinary error:", cloudError);
        return res.status(500).json({ success: false, message: "Error removing image" });
      }
    }

    // Upload new image if provided
    if (req.file) {
      // Delete old image if it exists
      if (category.image) {
        const publicId = category.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      
      category.image = req.file.path; // Directly use uploaded image URL
    }

    // Update Name
    category.name = name || category.name;
    await category.save();

    res.json({ success: true, category });

  } catch (error) {
    console.error("❌ Error updating category:", error);
    res.status(500).json({ success: false, message: "Error updating category" });
  }
});




// DELETE: Delete a category by ID
router.delete("/delete-category/:id", async (req, res) => {
  try {
    console.log("DELETE request received for category:", req.params);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid category ID format" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // Delete image from Cloudinary if it exists
    if (category.image) {
      const publicId = category.image.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }

    await Category.findByIdAndDelete(id);
    console.log("Category deleted successfully");

    res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});





// Banner routes
router.get("/banner", async (req, res) => {
  try {
    const banners = await Banner.find();
    // console.log("Fetched Banners:", JSON.stringify(banners, null, 2)); // Better debugging
    res.render("admin/adminbanner", { banners });
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).render("admin/adminbanner", { 
      banners: [],
      error: "Failed to fetch banners. Please try again later."
    });
  }
});


// Route to upload banners
router.post('/upload-banner', upload.array('images', 10), async (req, res) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    // Get form data
    const { superkey, title, description, category } = req.body;
    
    console.log('Files received:', req.files.length);
    console.log('Form data received:', req.body);

    // Make sure superkey is provided
    if (!superkey) {
      return res.status(400).json({ success: false, message: 'Super Key is required' });
    }

    // Convert title, description and category to arrays if they aren't already
    const titles = Array.isArray(title) ? title : [title];
    const descriptions = Array.isArray(description) ? description : [description];
    const categories = Array.isArray(category) ? category : [category];

    // Check if we have a title, description and category for each image
    if (titles.length !== req.files.length || descriptions.length !== req.files.length || categories.length !== req.files.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title, description and category are required for each image' 
      });
    }

    // Upload images to cloudinary and collect URLs
    const uploadPromises = req.files.map(async (file, index) => {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'banners',
        resource_type: 'auto'
      });
      
      // Delete the temporary file if it exists
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      
      return {
        url: result.secure_url,
        title: titles[index],
        description: descriptions[index],
        category: categories[index]
      };
    });

    const uploadResults = await Promise.all(uploadPromises);

    // Create banner URLs, titles, descriptions and categories arrays
    const urls = uploadResults.map(result => result.url);
    const processedTitles = uploadResults.map(result => result.title);
    const processedDescriptions = uploadResults.map(result => result.description);
    const processedCategories = uploadResults.map(result => result.category);

    // Check if banner with the same superkey exists
    let banner = await Banner.findOne({ superkey: superkey });

    if (banner) {
      // Update existing banner
      if (!banner.images) {
        banner.images = {};
      }
      
      // Initialize arrays if they don't exist
      if (!banner.images.url) banner.images.url = [];
      if (!banner.images.title) banner.images.title = [];
      if (!banner.images.description) banner.images.description = [];
      if (!banner.images.category) banner.images.category = [];
      
      // Append new data
      banner.images.url = [...banner.images.url, ...urls];
      banner.images.title = [...banner.images.title, ...processedTitles];
      banner.images.description = [...banner.images.description, ...processedDescriptions];
      banner.images.category = [...banner.images.category, ...processedCategories];
      
      await banner.save();
    } else {
      // Create new banner
      banner = new Banner({
        superkey: superkey,
        images: {
          url: urls,
          title: processedTitles,
          description: processedDescriptions,
          category: processedCategories
        }
      });
      
      await banner.save();
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Banners uploaded successfully', 
      data: banner 
    });
  } catch (err) {
    console.warn('Error uploading banners:', err);
    
    // Delete any uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error uploading banners', 
      error: err.message 
    });
  }
});

// Route to delete a banner image
router.post('/banners/delete/:id/:index', async (req, res) => {
  try {
    const { id, index } = req.params;
    
    // Find the banner
    const banner = await Banner.findById(id);
    
    if (!banner) {
      return res.status(404).send('Banner not found');
    }
    
    // Get the URL to delete from Cloudinary
    const imageUrl = banner.images.url[index];
    
    if (imageUrl) {
      // Extract the public_id from the URL
      const publicId = imageUrl.split('/').pop().split('.')[0];
      
      // Delete from Cloudinary
      await cloudinary.uploader.destroy(`banners/${publicId}`);
      
      // Remove the image, title, and description from arrays
      banner.images.url.splice(index, 1);
      
      if (banner.images.title) {
        banner.images.title.splice(index, 1);
      }
      
      if (banner.images.description) {
        banner.images.description.splice(index, 1);
      }
      
      // If no images left, delete the whole banner
      if (banner.images.url.length === 0) {
        await Banner.findByIdAndDelete(id);
      } else {
        await banner.save();
      }
    }
    
    res.redirect('/admin/banner');
  } catch (err) {
    console.error('Error deleting banner:', err);
    res.status(500).send('Error deleting banner');
  }
});



// Fetch messages
router.get("/contact", async (req, res) => {
  try {
      const contactMessages = await contact.find();
      res.render("admin/contact", { contact: contactMessages });
  } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).send("Internal Server Error");
  }
});



// GET all coupons (for displaying in the table)
router.get("/coupon", async (req, res) => {
  try {
    const coupons = await coupon.find();
    res.render("admin/coupon", { coupons });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// POST - Add a new coupon
router.post("/add-coupon", async (req, res) => {
  try {
    const { code, type, discount, minOrder, startDate, expiry, usageLimit, perCustomer } = req.body;

    const existingCoupon = await coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(400).send("Coupon code already exists.");
    }

    const newCoupon = new coupon({
      code,
      type,
      discount,
      minOrder,
      startDate,
      expiry,
      usageLimit,
      perCustomer,
    });

    await newCoupon.save();
    res.redirect("/admin/coupon");
  } catch (err) {
    res.status(500).send("Error creating coupon");
  }
});

// DELETE - Delete a coupon
router.delete("/coupon/delete/:id", async (req, res) => {
  try {
    await coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error deleting coupon" });
  }
});
  

// delivery boy display
router.get("/delivery-partner",async(req,res)=>{
try {
  const partners = await deliverypartner.find()
  res.render("admin/delivery-partner",{partners})
} catch (error) {
  res.status(500).send("server error")
  console.log("erro",error);
  
}
})


// Add Delivery Partner
router.post("/add-delivery-partner", async (req, res) => {
  try {
      const { name, phone, email } = req.body;
      const newPartner = new deliverypartner({ name, phone, email, isBlocked: false });
      await newPartner.save();
      res.redirect("/admin/delivery-partner");
  } catch (error) {
      res.status(500).send("Error adding delivery partner.");
  }
});

// Update Status (Block/Unblock)
router.put("/delivery-partner/status/:id", async (req, res) => {
  try {
      const { isBlocked } = req.body;
      await deliverypartner.findByIdAndUpdate(req.params.id, { isBlocked });
      res.json({ success: true, message: `Partner ${isBlocked ? "blocked" : "unblocked"} successfully.` });
  } catch (error) {
      res.json({ success: false, message: "Error updating status." });
  }
});

// Delete Delivery Partner
router.delete("/delivery-partner/delete/:id", async (req, res) => {
  try {
      await deliverypartner.findByIdAndDelete(req.params.id);
      res.json({ success: true });
  } catch (error) {
      res.json({ success: false, message: "Error deleting partner." });
  }
});




// Fetch orders
router.get("/orders", async (req, res) => {
  try {
    const orders = await order.find()
      .populate('userId', 'name')
      .populate('items.vendorId', 'restaurantName')
      .populate('items.productId', 'name price')
      .sort({ createdAt: -1 });

    const formattedOrders = orders.map(order => {
      // Calculate the total
      const total = order.items.reduce((sum, item) => 
        sum + ((item.productId?.price || 0) * item.quantity), 0);

      return {
        _id: order._id,
        orderNumber: order.orderNumber || order._id,
        userName: order.userId?.name || 'Unknown User', // Add null check
        // Keep the original items array AND add the total property to it
        items: {
          total: total,
          list: order.items // Store the original array as a list property
        },
        total: order.total,
        paymentMethod: order.payment?.method || 'Unknown',
        payment: { status: order.payment?.status || 'Unknown' },
        status: order.status,
        createdAt: order.createdAt
      };
    });

    res.render("admin/order", { orders: formattedOrders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).send("Internal Server Error");
  }
});



module.exports = router;
