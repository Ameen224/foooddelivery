const mongoose = require("mongoose");

const deliveryPartnerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    isBlocked: { type: Boolean, default: false },
    available: { type: Boolean, default: true } // New field to track availability
});

module.exports = mongoose.model("delivery-partner", deliveryPartnerSchema);

