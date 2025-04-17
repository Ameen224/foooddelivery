const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ["percent", "fixed"], required: true },
  discount: { type: Number, required: true },
  minOrder: { type: Number, default: 0 },
  startDate: { type: Date, required: true },
  expiry: { type: Date, required: true },
  usageLimit: { type: Number, default: null },
  perCustomer: { type: Number, required: true },
  usedCount: { type: Number, default: 0 },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }] // Track users who used the coupon
}, { timestamps: true });

module.exports = mongoose.model("Coupon", couponSchema);
