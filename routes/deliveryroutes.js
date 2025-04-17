const express = require("express");
const router = express.Router();
const nodemailer = require('nodemailer');
const session = require("express-session");
const crypto = require('crypto');


const delivery = require("../models/delivery-partner");
const order = require("../models/order")
const vendororder = require("../models/vendorOrders")
const { findById } = require("../models/admin");
// const { default: orders } = require("razorpay/dist/types/orders");

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS    
    }
});

// Temporary storage for OTPs (use Redis or a database in production)
const otpStorage = {};

// Utility functions
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

async function sendOTP(email, otp) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Email Verification OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #222831; text-align: center;">Email Verification</h2>
                    <p>Thank you for signing up! Please use the following OTP to verify your email address:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; padding: 10px 20px; background-color: #f5f5f5; border-radius: 5px;">${otp}</span>
                    </div>
                    <p>This OTP will expire in 10 minutes.</p>
                    <p>If you didn't request this verification, please ignore this email.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ', info.messageId);
        return info;
    } catch (error) {
        console.error('Email sending error:', error);
        return null;
    }
}

// Create a new utility function for sending delivery notifications
async function sendDeliveryNotification(email, orderNumber) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: `Your Order #${orderNumber} Has Been Delivered`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Your Order Has Been Delivered!</h2>
                    <p>Great news! Your order #${orderNumber} has been successfully delivered.</p>
                    <p>We hope you enjoy your purchase. If you have any questions or concerns about your order, please don't hesitate to contact our customer support.</p>
                    <p>Thank you for shopping with us!</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Delivery notification sent: ', info.messageId);
        return info;
    } catch (error) {
        console.error('Failed to send delivery notification:', error);
        return null;
    }
}

// Login page GET route
router.get("/login", async(req, res) => {
    res.render("delivery/login")
});

// Request login OTP route
router.post("/request-login-otp", async(req, res) => {
   try {
    const { email } = req.body;
    console.log("login", email);
    
    if(!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    const user = await delivery.findOne({ email: email.trim() });
    console.log("user", user);
    
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    if(user.isBlocked) {
        return res.status(403).json({ message: "Your account is blocked, contact the admin" });
    }
    
    const otp = generateOTP();
    otpStorage[email] = { otp, createdAt: new Date() };
    
    try {
        const emailSent = await sendOTP(email, otp);
        if (!emailSent) {
            return res.status(500).json({ message: 'Failed to send login verification email' });
        }
    } catch (emailError) {
        console.error('Email sending error:', emailError);
        return res.status(500).json({ message: 'Failed to send email' });
    }

    res.status(200).json({ message: 'Login OTP sent to your email address.' });
   } catch(error) {
      console.error('Login OTP request error:', error);
      res.status(500).json({ message: 'Server error' });
   }
});

// Resend login OTP route
router.post('/resend-login-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        const user = await delivery.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found with this email address' });
        }

        const otp = generateOTP();
        otpStorage[email] = { otp, createdAt: new Date() };
        
        try {
            const emailSent = await sendOTP(email, otp);
            if (!emailSent) {
                return res.status(500).json({ message: 'Failed to send login verification email' });
            }
        } catch (emailError) {
            console.error('Email sending error:', emailError);
            return res.status(500).json({ message: 'Failed to send email' });
        }

        res.status(200).json({ message: 'New login OTP sent to your email address.' });
    } catch (error) {
        console.error('Resend login OTP error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});



// Delivery partner authentication middleware
const isDeliveryAuthenticated = (req, res, next) => {
    console.log("Delivery Session Data:", req.session.delivery);
    
    if (!req.session?.delivery || !req.session.delivery.id) {
        console.log("Delivery partner not authenticated - redirecting to login");
        return res.redirect('/delivery/login');
    }
    
    next();
};

// Verify login OTP route
router.post('/verify-login-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log("data", req.body);
        
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }
        
        if (!otpStorage[email]) {
            return res.status(400).json({ message: 'OTP expired or invalid request. Please try again.' });
        }

        const otpData = otpStorage[email];
        if (otpData.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }

        const otpAge = (new Date() - otpData.createdAt) / (1000 * 60);
        if (otpAge > 10) {
            delete otpStorage[email];
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }

        // OTP verified successfully, fetch user and create session
        const user = await delivery.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

         // Clean up OTP
        delete otpStorage[email];


        // // Use session regeneration for security
        // req.session.regenerate((err) => {
        //     if (err) {
        //         console.error("Session regeneration error:", err);
        //         return res.status(500).json({ message: "Session error" });
        //     }

       // CONSISTENT SESSION FORMAT - Store delivery data under delivery key
       req.session.delivery = { 
        id: user._id.toString(), 
        name: user.email, 
        phone: user.phone,
        role: "delivery"
    };
        
       
        
        req.session.save(err => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(500).json({ message: "Session error" });
            }
            res.status(200).json({ 
                message: "Login successful!", 
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email
                }
            });
        });

    } catch (error) {
        console.error('Login OTP verification error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});





// GET Orders for Delivery Partner
router.get("/home", isDeliveryAuthenticated, async (req, res) => {
    try {
        // Get the logged-in delivery partner's ID from the session
        const deliveryPartnerId = req.session.delivery.id;

        // Find all vendor orders assigned to this delivery partner
        const vendorOrders = await vendororder.find({
            deliveryPartner: deliveryPartnerId
        }).populate({
            path: 'vendorId',
            select: 'restaurantName' // Get restaurant name for display
        }).populate({
            path: 'customerOrderId',
            select: 'address payment', // Get address and payment info from main order
            model: 'Order'
        }).populate({
            path: 'items.productId',
            select: 'name image' // Get product name and image
        });

        // If no orders found, just render the page with empty orders
        if (!vendorOrders || vendorOrders.length === 0) {
            return res.render("delivery/home", { orders: [] });
        }

        // For each vendor order, fetch the corresponding customer order to get address details
        const ordersWithDetails = await Promise.all(vendorOrders.map(async (vendorOrder) => {
            // The customer order ID is referenced in the vendorOrder model
            const customerOrder = await order.findById(vendorOrder.customerOrderId);
            
            // Return enhanced vendor order with address from customer order
            return {
                ...vendorOrder._doc,
                address: customerOrder ? customerOrder.address : null,
                items: vendorOrder.items.map(item => ({
                    ...item._doc,
                    vendorId: vendorOrder.vendorId, // Ensure vendorId is available for each item
                    orderId: vendorOrder._id // Add the order ID to each item
                }))
            };
        }));

        // Render the delivery home page with the orders
        res.render("delivery/home", { orders: ordersWithDetails });
        
    } catch (error) {
        console.error("Error fetching delivery orders:", error);
        res.status(500).json({ 
            message: "Failed to fetch delivery orders", 
            error: error.message 
        });
    }
});

// Update availability status
router.post("/availability", isDeliveryAuthenticated, async (req, res) => {
    try {
        const deliveryPartnerId = req.session.delivery.id; 
        if (!deliveryPartnerId) return res.status(401).json({ message: "Unauthorized" });

        const { available } = req.body;
        await delivery.findByIdAndUpdate(deliveryPartnerId, { available });
        res.json({ success: true, available });
    } catch (error) {
        console.error("Error updating availability:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// Fetch availability status
router.get("/availability/status", isDeliveryAuthenticated, async (req, res) => {
    try {
        const deliveryPartnerId = req.session.delivery.id;
        if (!deliveryPartnerId) return res.status(401).json({ message: "Unauthorized" });

        const deliveryPartner = await delivery.findById(deliveryPartnerId);
        res.json({ available: deliveryPartner?.available ?? false });
    } catch (error) {
        console.error("Error fetching availability status:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// Update order status (mark as delivered)
router.post("/update-order-status", isDeliveryAuthenticated, async (req, res) => {
    try {
        const deliveryPartnerId = req.session.delivery.id;
        if (!deliveryPartnerId) return res.status(401).json({ message: "Unauthorized" });

        const { orderId, status } = req.body;
        
        // Validate input
        if (!orderId || !status) {
            return res.status(400).json({ message: "Order ID and status are required" });
        }

        // Update vendor order status
        const vendorOrder = await vendororder.findById(orderId).populate('orderDetails.customerId');
        if (!vendorOrder) {
            return res.status(404).json({ message: "Order not found" });
        }

        // Verify this delivery partner is assigned to this order
        if (vendorOrder.deliveryPartner.toString() !== deliveryPartnerId) {
            return res.status(403).json({ message: "You are not authorized to update this order" });
        }

        // Update order status
        vendorOrder.orderDetails.orderStatus = status;
        
        // Add to status history if needed
        if (!vendorOrder.orderDetails.statusHistory) {
            vendorOrder.orderDetails.statusHistory = [];
        } else {
            vendorOrder.orderDetails.statusHistory.push({
                status: status,
                timestamp: new Date(),
                updatedBy: deliveryPartnerId
            });
        }
        
        await vendorOrder.save();

        // Update the main customer order status as well
        let customerOrder;
        if (vendorOrder.customerOrderId) {
            customerOrder = await order.findById(vendorOrder.customerOrderId);
            if (customerOrder) {
                customerOrder.status = "Delivered";
                
                // Add to status history if it doesn't exist
                if (!customerOrder.statusHistory) {
                    customerOrder.statusHistory = [];
                }
                
                customerOrder.statusHistory.push({
                    status: "Delivered",
                    date: new Date(),
                    note: "Marked as delivered by delivery partner"
                });
                
                await customerOrder.save();
            }
        }

        // Send email notification to customer if order is delivered
        if (status === "Delivered" && vendorOrder.orderDetails.customerId && vendorOrder.orderDetails.customerId.email) {
            const userEmail = vendorOrder.orderDetails.customerId.email;
            const orderNumber = vendorOrder.orderNumber || vendorOrder._id;
            
            const emailSent = await sendDeliveryNotification(userEmail, orderNumber);
            if (!emailSent) {
                console.warn(`Failed to send delivery notification for order ${orderNumber}`);
                // Note: We're not failing the request just because the email failed
            }
        }

        res.json({ 
            success: true, 
            message: `Order status updated to ${status}`,
            order: vendorOrder
        });

    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// Collect payment (for COD orders)
router.post("/collect-payment", isDeliveryAuthenticated, async (req, res) => {
    try {
        const deliveryPartnerId = req.session.delivery.id;
        if (!deliveryPartnerId) return res.status(401).json({ message: "Unauthorized" });

        const { orderId, customerOrderId } = req.body;
        
        // Validate input
        if (!orderId || !customerOrderId) {
            return res.status(400).json({ message: "Order ID and customer order ID are required" });
        }

        // Check vendor order
        const vendorOrder = await vendororder.findById(orderId);
        if (!vendorOrder) {
            return res.status(404).json({ message: "Order not found" });
        }

        // Verify this delivery partner is assigned to this order
        if (vendorOrder.deliveryPartner.toString() !== deliveryPartnerId) {
            return res.status(403).json({ message: "You are not authorized to update this order" });
        }

        // Use a custom field to track payment collection since "Collected" isn't in the enum
        vendorOrder.paymentCollected = true;
        
        // Keep payment status as "Pending" in vendor order since "Collected" is not an option
        vendorOrder.orderDetails.paymentStatus = "Pending";
        
        await vendorOrder.save();

        // Update the main customer order - this one can track "Collected" status
        const customerOrder = await order.findById(customerOrderId);
        if (customerOrder) {
            // Initialize payment object if it doesn't exist
            if (!customerOrder.payment) {
                customerOrder.payment = {
                    method: "Cash on Delivery",
                    status: "Paid" // Set the status as "Collected" in the customer order
                };
            } else {
                customerOrder.payment.status = "Paid";
            }
            
            // Add a note about payment collection to status history
            if (!customerOrder.statusHistory) {
                customerOrder.statusHistory = [];
            }
            
            customerOrder.statusHistory.push({
                status: "Payment Collected",
                date: new Date(),
                note: "Payment collected by delivery partner"
            });
            
            await customerOrder.save();
        }

        res.json({ 
            success: true, 
            message: "Payment collection recorded successfully",
            order: vendorOrder
        });

    } catch (error) {
        console.error("Error recording payment collection:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// Confirm payment received (for COD orders)
router.post("/confirm-payment", isDeliveryAuthenticated, async (req, res) => {
    try {
        const deliveryPartnerId = req.session.delivery.id;
        if (!deliveryPartnerId) return res.status(401).json({ message: "Unauthorized" });

        const { orderId, customerOrderId } = req.body;
        
        // Validate input
        if (!orderId || !customerOrderId) {
            return res.status(400).json({ message: "Order ID and customer order ID are required" });
        }

        // Check vendor order
        const vendorOrder = await vendororder.findById(orderId);
        if (!vendorOrder) {
            return res.status(404).json({ message: "Order not found" });
        }

        // Verify this delivery partner is assigned to this order
        if (vendorOrder.deliveryPartner.toString() !== deliveryPartnerId) {
            return res.status(403).json({ message: "You are not authorized to update this order" });
        }

        // Check if payment has been collected using the custom field we set
        if (!vendorOrder.paymentCollected) {
            return res.status(400).json({ message: "Payment must be collected before confirming as received" });
        }

        // Update payment status in vendor order to "Paid"
        vendorOrder.orderDetails.paymentStatus = "Paid";
        await vendorOrder.save();

        // Update the main customer order payment status
        const customerOrder = await order.findById(customerOrderId);
        if (customerOrder) {
            if (!customerOrder.payment) {
                customerOrder.payment = {
                    method: "Cash on Delivery",
                    status: "Paid"
                };
            } else {
                customerOrder.payment.status = "Paid";
            }
            
            // Add a note about payment confirmation
            if (!customerOrder.statusHistory) {
                customerOrder.statusHistory = [];
            }
            
            customerOrder.statusHistory.push({
                status: "Payment Confirmed",
                date: new Date(),
                note: "Payment confirmed by delivery partner"
            });
            
            await customerOrder.save();
        }

        res.json({ 
            success: true, 
            message: "Payment confirmed successfully",
            order: vendorOrder
        });

    } catch (error) {
        console.error("Error confirming payment:", error);
        res.status(500).json({ message: "Server Error" });
    }
});


module.exports = router;