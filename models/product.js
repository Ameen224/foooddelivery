// Ensure mongoose is required at the top
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category", // Reference to the Category model
    required: true
  },
  subcategory: {
    type: String, // Can be a reference or a string
    required: false
  },
  images: {
    type: [String], // Array of image URLs
    required: false
  },
  stock: {
    type: Number,
    default: 0
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor", // Reference to the Vendor model
    required: true
  }
});

// Prevent OverwriteModelError
const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

module.exports = Product;
