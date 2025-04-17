const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
    type: String,
    addressnames: String,
    addressphone: Number,
    street: String,
    city: String,
    state: String,
    zip: String,
    country: { type: String, default: 'India' },
    isDefault: { type: Boolean, default: false }
});

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    items: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true }, // ✅ Correct
            name: { type: String, required: true },
            image: { type: String, default: "" },
            price: { type: Number, required: true },
            quantity: { type: Number, required: true },
            total: { type: Number, required: true }
        }
    ],
    

    address: AddressSchema, // Using the same schema from user.js for consistency

    payment: {
        method: { type: String, enum: ['Razorpay', 'Cash on Delivery'], required: true },
        transactionId: { type: String, default: null },
        status: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' }
    },

    subtotal: { type: Number, required: true },
    shipping: { type: Number, default: 0 }, // Can be updated based on order amount
    discount: { type: Number, default: 0 }, // Discount applied from coupons
    total: { type: Number, required: true },

    status: { 
        type: String, 
        enum: ['Placed', 'Processing', 'On the way', 'Delivered', 'Cancelled'], 
        default: 'Placed' 
    },

    statusHistory: [
        {
            status: { type: String },
            date: { type: Date, default: Date.now },
            note: { type: String }
        }
    ],

    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
