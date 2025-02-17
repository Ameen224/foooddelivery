const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
  restaurantName: { type: String, required: true },
  restaurantAddress: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: false }, // ✅ Changed to String
  password: { type: String, required: true },
  isApproved: { type: Boolean, default: false }, // ✅ Track admin approval
  isBlocked: { type: Boolean, default: false }
});

module.exports = mongoose.model("Vendor", vendorSchema);
