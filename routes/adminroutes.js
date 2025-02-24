const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const { check, validationResult } = require("express-validator");  // Added express-validator for better input validation

dotenv.config();
const router = express.Router();

const Admin = require("../models/admin");
const Vendor = require("../models/vendor");
const Product = require("../models/product");
const Category = require("../models/category");
const cloudinary = require("../config/cloudinary"); 



const storage = multer.memoryStorage();
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
router.get("/home", (req, res) => {
  res.render("admin/adminhome");
});

// Fetch All Vendors (approved)
router.get("/vendor-list", async (req, res) => {
  try {
    const vendors = await Vendor.find({ isApproved: true });
    res.status(200).json(vendors);
  } catch (err) {
    console.error("Vendor List Error:", err);
    res.status(500).json({ message: "Error fetching vendor list", error: err.message });
  }
});

// Fetch Pending Vendors
router.get("/pending-vendors", async (req, res) => {
  try {
    const pendingVendors = await Vendor.find({ isApproved: false });
    res.status(200).json(pendingVendors);
  } catch (err) {
    console.error("Error fetching pending vendors:", err);
    res.status(500).json({ message: "Error fetching pending vendors", error: err.message });
  }
});

// Approve Vendor (PATCH instead of PUT)
router.patch("/approve-vendor/:id", async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    res.status(200).json({ message: `Vendor ${vendor.restaurantName} has been approved` });
  } catch (err) {
    console.error("Approval Error:", err);
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
    res.status(200).json(categories);
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

    // Upload image to Cloudinary if provided
    let imageUrl = "";
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }).end(req.file.buffer);
      });

      imageUrl = result;
    }

    // Save category to DB
    const category = new Category({ name, image: imageUrl });
    await category.save();

    res.status(201).json({ message: "Category added successfully!", category });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Failed to add category." });
  }
});


// Edit a category
router.put("/edit-category/:id", upload.single("image"), async (req, res) => {
  const { name } = req.body;

  try {
    // Check for duplicate category name (excluding current category)
    const existingCategory = await Category.findOne({ name, _id: { $ne: req.params.id } });
    if (existingCategory) {
      return res.status(400).json({ message: "Category name already exists" });
    }

    let imageUrl = req.body.image; // Keep existing image if no new file is uploaded

    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }).end(req.file.buffer);
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      { name, image: imageUrl },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category updated successfully", updatedCategory });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Failed to update category." });
  }
});

// DELETE: Delete a category by ID
router.delete("/delete-category/:id", async (req, res) => {
  try {
      console.log("DELETE request received for category:", req.params);

      const { id } = req.params;

      
      if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid category ID format" });
      }

      const category = await Category.findById(id);
      if (!category) {
          console.log("Category not found in DB");
          return res.status(404).json({ message: "Category not found" });
      }

      await Category.findByIdAndDelete(id);
      console.log("Category deleted successfully");

      res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Internal server error" });
  }
});


module.exports = router;
