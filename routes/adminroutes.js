const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const { check, validationResult } = require("express-validator");  // Added express-validator for better input validation

dotenv.config();
const router = express.Router();

const Admin = require("../models/admin");
const Vendor = require("../models/vendor");
// const Product = require("../models/product");
const Category = require("../models/category");

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

// Add a category with validation
router.post(
  "/add-category",
  [
    check("name").notEmpty().withMessage("Category name is required"),
    check("name").custom(async (name) => {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        throw new Error("Category with this name already exists");
      }
    }),
    check("subcategory").optional().isString().withMessage("Subcategory must be a string"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, subcategory } = req.body;

    try {
      const newCategory = new Category({
        name: name,
        subcategory: subcategory,
      });

      await newCategory.save();

      res.status(200).send({ message: "Category added successfully!" });
    } catch (error) {
      console.error("Error adding category:", error);
      res.status(500).send({ message: "Failed to add category." });
    }
  }
);

// Delete a category
router.delete("/delete-category/:id", async (req, res) => {
  try {
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({ message: "Category deleted successfully" });
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Edit a category
router.put("/edit-category/:id", async (req, res) => {
  const { name, subcategory } = req.body;

  try {
    // Find the category by ID and update
    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      { name, subcategory },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category updated successfully", updatedCategory });
  } catch (err) {
    console.error("Error updating category:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
