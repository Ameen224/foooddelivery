// User Schema (corrected)
const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  type: String, // Added type field that's in the HTML but missing in schema
  street: String,
  city: String,
  state: String,
  zip: String, // Changed from zipCode to zip to match frontend
  country: String,
  isDefault: { type: Boolean, default: false }
});

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  addresses: [AddressSchema],
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Ensure at least one default address is set
UserSchema.pre('save', function (next) {
  if (this.addresses.length && !this.addresses.some(addr => addr.isDefault)) {
    this.addresses[0].isDefault = true;
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
