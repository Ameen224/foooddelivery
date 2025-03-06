const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
  restaurantName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: false },
  password: { type: String, required: true },
  isApproved: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  location: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null }
  }
});

module.exports = mongoose.model("Vendor", vendorSchema);