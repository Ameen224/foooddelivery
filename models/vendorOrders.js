const mongoose = require("mongoose");

const VendorOrderSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true,
  },
  orderNumber: {
    type: String,
    required: true,
  },
  customerOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      price: {
        type: Number,
        required: true,
      },
      total: {
        type: Number,
        required: true,
      }
    }
  ],
  orderDetails: {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Pending",
    },
    orderStatus: {
      type: String,
      enum: ["Placed", "Processing", "Out for Delivery", "Delivered", "Cancelled"],
      default: "Placed",
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
  },
  deliveryPartner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "delivery-partner",
    default: null, // Initially, no delivery partner assigned
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("VendorOrder", VendorOrderSchema);
