const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ["percent", "fixed"], required: true },
  discount: { type: Number, required: true },
  minOrder: { type: Number, default: 0 },
  startDate: { type: Date, required: true },
  expiry: { type: Date, required: true },
  usageLimit: { type: Number, default: null }, // Max usage of the coupon
  perCustomer: { type: Number, required: true }, // Max use per customer
  usedCount: { type: Number, default: 0 }, // Track the number of times the coupon is used
}, { timestamps: true });

module.exports = mongoose.model("Coupon", couponSchema);
