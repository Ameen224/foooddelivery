const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  subcategory: {
    type: String,  // or use an array if you want multiple subcategories
    required: false
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
