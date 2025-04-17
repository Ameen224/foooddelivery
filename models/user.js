// User Schema (corrected)
const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  type: String,
  addressnames: String,
 addressphone: Number,
  street: String,
  city: String,
  state: String,
  zip: String,
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


module.exports = mongoose.model('User', UserSchema);
