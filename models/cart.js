const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: String,
        image: String,
        variant: String,
        price: Number,
        quantity: { type: Number, default: 1 }
    }],
    subtotal: { type: Number, default: 0 },
    shipping: { type: Number, default: 5 },  // Default shipping fee
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
});

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
