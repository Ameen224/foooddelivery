const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  image:{
    type: String, // Store a single image URL
    required: true
  }
});

// Virtual field to fetch related products (populate in Category)
categorySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  justOne: false
});

module.exports = mongoose.model("Category", categorySchema);
