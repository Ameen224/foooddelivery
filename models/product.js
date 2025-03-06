const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true // Removes unnecessary spaces
    },
    description: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0 // Ensures price is non-negative
    },
    category: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true
    }],
  secondprice :{
    type: Number,
    require:true,
    min:0
  },
    images: {
      type: [String] // Array of image URLs
    },
    stock: {
      type: Number,
      default: 0,
      min: 0 // Ensures stock doesn't go below 0
    },
    status: {
      type: String,
      enum: ["available", "out_of_stock"], // Make sure these match exactly
      default: "active"
    },
    isVeg: {
      type: Boolean,
      required: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true
    }
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

// Prevent OverwriteModelError
const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

module.exports = Product;
