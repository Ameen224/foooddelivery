const express = require("express");
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const session = require("express-session");

// Import models
const Product = require("../models/product");
const Banner = require("../models/banner");
const Vendor = require("../models/vendor");
const Contact = require('../models/contact');
const Category = require("../models/category");
const User = require('../models/user');
const Cart = require('../models/cart');
const Coupon=require('../models/coupon')
const Order=require('../models/order');
const VendorOrder= require('../models/vendorOrders')
const { log } = require("console");


// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ameen8714228@gmail.com', // Replace with your actual Gmail address
        pass: 'mkph rnlm vfhz mbpm'     // Replace with your actual app password
    }
});

// Temporary storage for OTPs (use Redis or a database in production)
const otpStorage = {};

// Utility functions
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

async function sendOTP(email, otp) {
    const mailOptions = {
        from: 'ameen8714228@gmail.com',
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

    return transporter.sendMail(mailOptions);
}

// User authentication middleware
const isUserAuthenticated = (req, res, next) => {
    console.log("User Session Data:", req.session.user);
    
    if (!req.session?.user || !req.session.user.id) {
        console.log("User not authenticated - redirecting to login");
        return res.redirect('/user/login');
    }
    
    next();
};

// Home page route
router.get("/home", async (req, res) => {
    try {
        const bannerData = await Banner.findOne({ superkey: "1111" });

        let banners = [];
        if (bannerData && bannerData.images && bannerData.images.url && bannerData.images.url.length) {
            banners = bannerData.images.url.map((url, index) => ({
                url,
                title: bannerData.images.title[index] || "No Title",
                description: bannerData.images.description[index] || "No Description",
                category: bannerData.images.category[index] || null // Include category ID from the banner data
            }));
        }

        const vendors = await Vendor.find({ isApproved: true, isBlocked: false }).limit(8);
        const categories = await Category.find({}).limit(10);

        res.render("user/userhome", {
            title: "User Home",
            activePage: "home",
            banners,
            vendors,
            categories
        });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Restaurant menu page route
router.get('/restaurant/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const vendorData = await Vendor.findById(id);
        if (!vendorData) {
            return res.status(404).send('Vendor not found');
        }

        const products = await Product.find({ vendorId: id });
        res.render('user/hotelmenu', { vendor: vendorData, products });
    } catch (error) {
        console.error("Error in /restaurant/:vendorId route:", error);
        res.status(500).send('Internal Server Error');
    }
});

// About Page route
router.get("/about", (req, res) => {
    res.render("user/about", { title: "About", activePage: "about" });
});

// Contact form submission API endpoint
router.post('/api/contact', [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, message } = req.body;
        const newContact = new Contact({
            name,
            email,
            message,
            date: new Date()
        });

        await newContact.save();
        return res.status(201).json({ success: true, message: 'Contact message saved successfully' });
    } catch (error) {
        console.error('Contact submission error:', error);
        return res.status(500).json({ success: false, message: 'Server error processing your request' });
    }
});

// Product details route
router.get("/product/:id", async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).send("Product not found");
        }
        res.render("user/product", { product });
    } catch (error) {
        res.status(500).send("Error fetching product");
    }
});

// Category route
router.get("/category/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;
        console.log("data",categoryId);
        
        const products = await Product.find({ category: categoryId }).populate("vendorId");

        const vendors = {};
        products.forEach((product) => {
            if (product.vendorId) {
                if (!vendors[product.vendorId._id]) {
                    vendors[product.vendorId._id] = {
                        vendor: product.vendorId,
                        products: [],
                        featuredProductId: product._id
                    };
                }
                vendors[product.vendorId._id].products.push(product);
            }
        });

        const vendorList = Object.values(vendors);
        res.render("user/category_vendors", { 
            vendorList, 
            categoryId, 
            title: "Restaurants for Selected Category" 
        });
    } catch (error) {
        console.error("Error fetching vendors by category:", error);
        res.status(500).render("error", { message: "Internal Server Error", error });
    }
});

// Restaurant products route

router.get("/restaurant/:id/product/:productId?", async (req, res) => {
    try {
        const vendorId = req.params.id;
        const selectedProductId = req.params.productId;
        const categoryId = req.query.categoryId;

        const vendordata = await Vendor.findById(vendorId);
        if (!vendordata) {
            return res.status(404).render("error", { message: "Restaurant not found" });
        }

        let productQuery = { vendorId: vendorId };
        let categoryProducts = [];
        if (categoryId) {
            categoryProducts = await Product.find({ vendorId: vendorId, category: categoryId }).lean();
        }

        let allProducts = await Product.find(productQuery).populate('category').lean();
        const otherProducts = categoryId 
            ? allProducts.filter(p => !categoryProducts.some(cp => cp._id.toString() === p._id.toString())) 
            : allProducts;
        const products = [...categoryProducts, ...otherProducts];

        if (selectedProductId) {
            const selectedProductIndex = products.findIndex(p => p._id.toString() === selectedProductId);
            if (selectedProductIndex > -1) {
                const selectedProduct = products.splice(selectedProductIndex, 1)[0];
                products.unshift(selectedProduct);
            }
        }

        res.render("user/restaurant_products", {
            vendordata,
            products,
            title: `${vendordata.restaurantName} - Products`,
            selectedCategoryId: categoryId
        });
    } catch (error) {
        console.error("Error fetching restaurant details:", error);
        res.status(500).render("error", { message: "Internal Server Error", error });
    }
});

// Search route
router.get('/search', async (req, res) => {
    try {
        const searchQuery = req.query.q;
        if (!searchQuery) {
            return res.redirect('/');
        }

        const products = await Product.find({
            $or: [
                { name: { $regex: searchQuery, $options: 'i' } },
                { description: { $regex: searchQuery, $options: 'i' } }
            ]
        }).populate('vendorId');

        const restaurantsWithMatchingProducts = {};
        products.forEach(product => {
            if (product.vendorId && product.vendorId._id) {
                const vendorId = product.vendorId._id.toString();
                if (!restaurantsWithMatchingProducts[vendorId]) {
                    restaurantsWithMatchingProducts[vendorId] = {
                        vendor: product.vendorId,
                        matchingProducts: []
                    };
                }
                restaurantsWithMatchingProducts[vendorId].matchingProducts.push(product);
            }
        });

        const results = Object.values(restaurantsWithMatchingProducts);
        res.render('user/search-results', { 
            results, 
            searchQuery, 
            totalProducts: products.length, 
            totalRestaurants: results.length 
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).send(`
            <h1>Error</h1>
            <p>An error occurred while searching</p>
            <p>${process.env.NODE_ENV === 'development' ? error.message : ''}</p>
            <a href="/">Return to Home</a>
        `);
    }
});

// Login route
router.get('/login', (req, res) => {
    res.render("user/loginandsignup");
});

// Signup route
router.post('/signup', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists!' });
        }

        const otp = generateOTP();
        otpStorage[email] = { name, email, phone, password, otp, createdAt: new Date() };
        await sendOTP(email, otp);

        res.status(200).json({ 
            message: 'OTP sent to your email address. Please verify to complete signup.', 
            email 
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// OTP verification route
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }
        
        if (!otpStorage[email]) {
            return res.status(400).json({ message: 'OTP expired or invalid request. Please try again.' });
        }

        const userData = otpStorage[email];
        if (userData.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }

        const otpAge = (new Date() - userData.createdAt) / (1000 * 60);
        if (otpAge > 10) {
            delete otpStorage[email];
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }

        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const newUser = new User({
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            password: hashedPassword,
            isVerified: true
        });

        await newUser.save();
        delete otpStorage[email];
        res.status(201).json({ message: 'Signup successful! You can now login.' });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Resend OTP route
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        if (!otpStorage[email]) {
            return res.status(400).json({ message: 'No pending registration found for this email.' });
        }

        const otp = generateOTP();
        otpStorage[email].otp = otp;
        otpStorage[email].createdAt = new Date();
        await sendOTP(email, otp);

        res.status(200).json({ message: 'New OTP sent to your email address.' });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Request login OTP route
router.post('/request-login-otp', async (req, res) => {
    try {
        
        
        const { email } = req.body;
        
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found with this email address' });
        }

        if (!user.isVerified) {
            return res.status(400).json({ message: 'Account not verified. Please complete signup process first.' });
        }

        const otp = generateOTP();
        otpStorage[email] = { otp, createdAt: new Date() };
        const emailSent = await sendOTP(email, otp, true);
        
        if (!emailSent) {
            return res.status(500).json({ message: 'Failed to send login verification email' });
        }

        res.status(200).json({ message: 'Login OTP sent to your email address.' });
    } catch (error) {
        console.error('Login OTP request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify login OTP route
router.post('/verify-login-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log("data",req.body);
        
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
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

         // Clean up OTP
         delete otpStorage[email];
        

        // req.session.regenerate((err) => {
        //     if (err) {
        //         console.error("Session regeneration error:", err);
        //         return res.status(500).json({ message: "Session error" });
        //     }

        // Create session for user
        req.session.user = { 
            id: user._id.toString(), 
            name: user.name, 
            email: user.email, 
            phone: user.phone,
            role:"user"
        };
        
       
        // Generate JWT token if needed
        // const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

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
                // Uncomment if using JWT
                // token
            });
        });

    } catch (error) {
        console.error('Login OTP verification error:', error);
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
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found with this email address' });
        }

        const otp = generateOTP();
        loginOtpStorage[email] = { otp, createdAt: new Date() };
        const emailSent = await sendOTP(email, otp, true);
        
        if (!emailSent) {
            return res.status(500).json({ message: 'Failed to send login verification email' });
        }

        res.status(200).json({ message: 'New login OTP sent to your email address.' });
    } catch (error) {
        console.error('Resend login OTP error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


// User profile route
router.get("/profile", isUserAuthenticated, async (req, res) => {
    try {
        
     const user = await User.findById(req.session.user.id);
        const orders = await Order.find({ userId: req.session.user.id }).lean(); // Fetch orders
        // console.log("dataaaaa",user,orders);


        console.log("Orders:", orders); // Debugging

        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        res.render("user/profile", { user, orders: orders || [] }); // Ensure orders is always an array
    } catch (err) {
        console.error("Profile route error:", err);
        res.status(500).send("Error loading profile");
    }
});


// Profile update route
router.post("/profile/update", isUserAuthenticated, async (req, res) => {
    try {
        const { name, phone, email } = req.body;
        
        if (!name || !phone || !email) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        
        // Check if email or phone already exists for another user
        const existingUser = await User.findOne({
            $and: [
                { _id: { $ne: req.session.user.id } },
                { $or: [{ email }, { phone }] }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: "Email or phone already in use by another account" 
            });
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            req.session.user.id, 
            { name, phone, email },
            { new: true }
        );
        
        // Update session data
        req.session.user.name = updatedUser.name;
        req.session.user.email = updatedUser.email;
        req.session.user.phone = updatedUser.phone;
        
        res.json({ success: true, message: "Profile updated successfully" });
    } catch (err) {
        console.error("Profile update error:", err);
        res.status(500).json({ success: false, message: "Failed to update profile" });
    }
});

// Address management route
router.post("/profile/address", isUserAuthenticated, async (req, res) => {
    try {
        const { id, type, addressnames, addressphone, street, city, state, zip, isDefault } = req.body;

        console.log("Received Data:", req.body);

       
        
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        console.log("hi");
        
        if (id) {
            const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === id);
            if (addressIndex !== -1) {
                user.addresses[addressIndex] = { 
                    _id: id, 
                    type,
                    addressnames,
                    addressphone,
                    street,
                    city,
                    state,
                    zip,
                    isDefault 
              };
            } else {
                return res.status(404).json({ success: false, message: "Address not found" });
            }
        } else {
          // If address is default, update other addresses
           if (isDefault) {
          user.addresses.forEach(addr => addr.isDefault = false);
          }
            user.addresses.push({ type, street, city, state, zip, addressnames , addressphone , isDefault });
        }

        await user.save();
        res.json({ 
            success: true, 
            message: "Address saved successfully", 
            addresses: user.addresses 
        });
    } catch (err) {
        console.error("Address route error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Set default address route
router.post("/profile/address/default", isUserAuthenticated, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: "Address ID is required" });
        }
        
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        // Find the address and set it as default
        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === id);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }
        
        // Update all addresses to non-default
        user.addresses.forEach(addr => {
            addr.isDefault = false;
        });
        
        // Set the selected address as default
        user.addresses[addressIndex].isDefault = true;
        
        await user.save();
        res.json({ 
            success: true, 
            message: "Default address updated successfully",
            addresses: user.addresses
        });
    } catch (err) {
        console.error("Set default address error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Address delete route
router.post("/profile/address/delete", isUserAuthenticated, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: "Address ID is required" });
        }
        
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        // Check if the address exists
        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === id);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }
        
        // Check if it's the default address
        const isDefault = user.addresses[addressIndex].isDefault;
        
        // Remove the address
        user.addresses.splice(addressIndex, 1);
        
        // If we deleted the default address and there are other addresses,
        // set the first one as default
        if (isDefault && user.addresses.length > 0) {
            user.addresses[0].isDefault = true;
        }
        
        await user.save();
        res.json({ 
            success: true, 
            message: "Address deleted successfully",
            addresses: user.addresses
        });
    } catch (err) {
        console.error("Address delete error:", err);
        res.status(500).json({ success: false, message: "Failed to delete address" });
    }
});

// Logout route
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout Error:', err);
            return res.json({ success: false, message: 'Logout failed!' });
        }
        res.json({ success: true });
    });
});

//calculating the cart 
const calculateCartTotals = (cart) => {
    let subtotal = 0;
    let discount = 0;
    let shipping = 100; // Default shipping charge

    // Calculate subtotal
    cart.items.forEach(item => {
        subtotal += item.price * item.quantity;
    });

    // Apply coupon discount if it exists
    if (cart.coupon && cart.coupon._id) {
        const coupon = cart.coupon;
        
        if (coupon) {
            if (coupon.type === 'percent') {
                discount = (subtotal * coupon.discount) / 100;
            } else if (coupon.type === 'fixed') {
                discount = coupon.discount;
            }
        }
    }

    // If the subtotal after discount is above ₹400, shipping is free
    let totalAfterDiscount = subtotal - discount;
    if (totalAfterDiscount > 400) {
        shipping = 0;
    }

    // Calculate tax (5% tax rate)
    let tax = totalAfterDiscount * 0.025; // 5% tax
    tax = isNaN(tax) ? 0 : tax;  // Ensure tax is a valid number

    // Ensure total is calculated properly
    let total = totalAfterDiscount + shipping + tax;
    total = isNaN(total) ? 0 : total;  // Ensure total is a valid number

    // Update cart with calculated values
    cart.subtotal = subtotal;
    cart.discount = discount;
    cart.shipping = shipping;
    cart.tax = tax;
    cart.total = parseFloat(total.toFixed(2));  // Round to 2 decimal places

    return cart;
};

// Get Cart
router.get('/cart', isUserAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
// In your GET /cart route
let cart = await Cart.findOne({ userId }).populate('items.productId').populate('coupon');
        if (!cart) {
            cart = { items: [], subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 };
        } else {
            cart = calculateCartTotals(cart);
        }

        // Ensure that cart.coupon is always an object (even when no coupon applied)
        if (cart.coupon && typeof cart.coupon !== 'object') {
            cart.coupon = { discount: 0, type: 'percent' }; // Default to no discount
        }

        res.render('user/cart', { cart });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).send('Server Error');
    }
});

// Add Item to Cart
router.post('/cart/add', isUserAuthenticated, async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.session.user.id;

        // Find the product to get its details
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Check if product is available and has enough stock
        if (product.status !== "available" || product.stock < quantity) {
            return res.status(400).json({ success: false, message: 'Product is out of stock or unavailable' });
        }


        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);

        if (itemIndex > -1) {
            // If item exists, update quantity
            cart.items[itemIndex].quantity += quantity;
        } else {
            // If item doesn't exist, add new item with all required fields
            cart.items.push({
                productId: product._id,
                name: product.name,
                image: product.images[0], // Use first image as cart thumbnail
                price: product.price,
                quantity: quantity
            });
        }

        


        // Ensure `order` exists before saving
        if (!product.order) {
            product.order = 0; // Set a default value
        }


        cart = calculateCartTotals(cart);
        await cart.save();

        res.json({ success: true, cart });
    } catch (error) {
        console.error('Error adding item:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Update Item Quantity
router.post('/cart/update', isUserAuthenticated, async (req, res) => {
    try {
        const { itemId, quantity } = req.body;
        const userId = req.session.user.id;

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const item = cart.items.find(item => item._id.toString() === itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        item.quantity = Math.max(1, parseInt(quantity, 10) || 1);

        cart = calculateCartTotals(cart);
        await cart.save();

        res.json({ success: true, cart });
    } catch (error) {
        console.error('Error updating item:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Remove Item from Cart
router.post('/cart/remove', isUserAuthenticated, async (req, res) => {
    try {
        const { itemId } = req.body;
        const userId = req.session.user.id;

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        cart.items = cart.items.filter(item => item._id.toString() !== itemId);

        cart = calculateCartTotals(cart);
        await cart.save();

        res.json({ success: true, cart });
    } catch (error) {
        console.error('Error removing item:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Apply Coupon
router.post('/cart/apply-coupon', isUserAuthenticated, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.session.user.id;

        let cart = await Cart.findOne({ userId }).populate('coupon'); 

        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const coupon = await Coupon.findOne({ code });
        if (!coupon) {
            return res.status(400).json({ success: false, message: 'Invalid coupon code' });
        }
        if ( new Date() < coupon.startDate){
            return res.status(400).json({success: false ,message: 'Coupon is not yet active'})
        }

        if (new Date() > coupon.expiry) {
            return res.status(400).json({ success: false, message: 'Coupon has expired' });
        }

        if (cart.subtotal < coupon.minOrder) {
            return res.status(400).json({ success: false, message: `Minimum order of ₹${coupon.minOrder} required` });
        }

        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
        }

        // Check per customer usage from Coupon model instead of Cart
        const userCouponUsage = coupon.usedBy?.filter(u => u.toString() === userId.toString()).length || 0;
        if (userCouponUsage >= coupon.perCustomer) {
            return res.status(400).json({ success: false, message: 'Personal usage limit exceeded' });
        }

        // Remove previous coupon usage count
        if (cart.coupon) {
            const previousCoupon = await Coupon.findById(cart.coupon);
            if (previousCoupon) {
                previousCoupon.usedCount = Math.max(0, previousCoupon.usedCount - 1);
                previousCoupon.usedBy = previousCoupon.usedBy.filter(u => u.toString() !== userId.toString());
                await previousCoupon.save();
            }
        }

        // Apply the new coupon
        cart.coupon = coupon._id;
        cart = calculateCartTotals(cart);

        await cart.save();

        // Update coupon usage count
        coupon.usedCount += 1;
        coupon.usedBy.push(userId);
        await coupon.save();

        res.json({ success: true, cart, message: 'Coupon applied successfully' });
    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


// Remove Coupon
router.post('/cart/remove-coupon', isUserAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        // If no coupon applied, return a message
        if (!cart.coupon) {
            return res.status(400).json({ success: false, message: 'No coupon applied to the cart' });
        }

        // Remove the coupon
        cart.coupon = null;

        // Recalculate totals
        cart = calculateCartTotals(cart);

        // Save updated cart
        await cart.save();

        res.json({ success: true, cart, message: 'Coupon removed successfully' });
    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});




// Initialize Razorpay with your key id and secret
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET
});

// Get checkout page
router.get('/checkout', isUserAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    console.log("user",req.session.user.id);
    
    const cart = await Cart.findOne({ userId: req.session.user.id }).populate('items.productId').populate('items.vendorId');
    
    if (!cart || cart.items.length === 0) {
        
      return res.redirect('/cart');
    }
    console.log("hlo");
    
    
    const payments = [
        { type: 'Razorpay', details: 'Pay securely using Razorpay' },
        { type: 'Cash on Delivery', details: 'Pay in cash upon delivery' }
      ];
  
    res.render('user/checkout', { 
      user, 
      cart, 
      addresses: user.addresses || [],
      payments,
      title: 'Checkout',
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone || '',
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).redirect('/user/cart');
  }
});

router.post("/checkout/add-address", isUserAuthenticated, async (req, res) => {
  try {
    // console.log("Request received at /checkout/add-address");
    // console.log("Request body:", req.body);

    const { id, type, addressnames, addressphone, street, city, state, zip, isDefault } = req.body;

    const user = await User.findById(req.session.user.id);
    if (!user) {
      console.log("User not found");
      return res.status(404).json({ error: "User not found" });
    }

    if (!type || !addressnames || !addressphone || !street || !city || !state || !zip) {
      console.log("Missing required fields");
      return res.status(400).json({ error: "All address fields are required" });
    }

    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(addressphone)) {
      console.log("Invalid phone number");
      return res.status(400).json({ error: "Please enter a valid 10-digit phone number" });
    }

    if (id) {
      const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === id);
      if (addressIndex !== -1) {
        console.log("Updating existing address");
        user.addresses[addressIndex] = { 
          _id: id, 
          type,
          addressnames,
          addressphone,
          street,
          city,
          state,
          zip,
          isDefault: isDefault === 'true' || isDefault === true
        };
      } else {
        console.log("Address not found");
        return res.status(404).json({ error: "Address not found" });
      }
    } else {
      console.log("Adding new address");
      const isDefaultBool = isDefault === 'true' || isDefault === true;
      if (isDefaultBool) {
        user.addresses.forEach(addr => addr.isDefault = false);
      }
      user.addresses.push({ 
        type, 
        addressnames, 
        addressphone, 
        street, 
        city, 
        state, 
        zip, 
        isDefault: isDefaultBool 
      });
    }

    await user.save();
    console.log("Address saved successfully");
    res.json({ success: true, message: "Address saved successfully" });
  } catch (err) {
    console.error("Add address error:", err);
    res.status(500).json({ error: "Failed to add address" });
  }
});

// POST route for placing an order
router.post('/checkout/place-order', isUserAuthenticated, async (req, res) => {
    try {
      const { addressId, paymentMethod } = req.body;
      const userId = req.session.user.id;
      
      // Get user for address
      const user = await User.findById(userId);
      if (!user || !user.addresses[addressId]) {
        return res.status(400).json({ success: false, message: 'Invalid address selection' });
      }
      const selectedAddress = user.addresses[addressId];
  
      // Get cart
      const cart = await Cart.findOne({ userId }).populate('items.productId');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
      }
  
      // Check stock and update it
      for (const item of cart.items) {
        const product = await Product.findById(item.productId._id);
        if (!product) {
          return res.status(400).json({ success: false, message: 'Product not found' });
        }
        
        if (product.stock < item.quantity) {
          return res.status(400).json({ 
            success: false, 
            message: `Not enough stock available for ${product.name}` 
          });
        }
        
        // Reduce stock
        product.stock -= item.quantity;
        await product.save();
      }
  
      // Format items for order
      const orderItems = cart.items.map(item => ({
        productId: item.productId._id,
        vendorId: item.productId.vendorId, 
        name: item.productId.name,
        image: item.productId.images[0],
        price: item.productId.price,
        quantity: item.quantity,
        total: item.productId.price * item.quantity
      }));
  
      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
      // Create main customer order
      const order = new Order({
        userId,
        orderNumber,
        items: orderItems,
        address: selectedAddress,
        payment: {
          method: paymentMethod === 0 ? 'Razorpay' : 'Cash on Delivery',
          status: paymentMethod === 0 ? 'Pending' : 'Pending'
        },
        subtotal: cart.subtotal,
        shipping: cart.shipping,
        discount: cart.discount,
        total: cart.total,
        status: 'Placed',
        statusHistory: [
          {
            status: 'Placed',
            date: new Date(),
            note: 'Order placed by customer'
          }
        ]
      });
  
      await order.save();
  
      // Create consolidated vendor orders
      // Group items by vendor
      const vendorItemsMap = {};
      
      for (const item of orderItems) {
        const vendorId = item.vendorId.toString();
        
        if (!vendorItemsMap[vendorId]) {
          vendorItemsMap[vendorId] = {
            items: [],
            totalAmount: 0
          };
        }
        
        vendorItemsMap[vendorId].items.push({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        });
        vendorItemsMap[vendorId].totalAmount += item.total;
      }
      
      // Create one vendor order per vendor (instead of per item)
      const vendorOrders = [];
      for (const [vendorId, data] of Object.entries(vendorItemsMap)) {
        const vendorOrder = new VendorOrder({
          vendorId: vendorId,
          orderNumber: orderNumber,
          customerOrderId: order._id,
          items: data.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            total: item.quantity * item.price
          })),
          orderDetails: {
            customerId: userId,
            totalPrice: data.totalAmount,
            paymentStatus: paymentMethod === 0 ? 'Pending' : 'Pending',
            orderStatus: 'Placed',
            orderDate: new Date()
          }
        });
        
        vendorOrders.push(vendorOrder);
      }
      
      // Save all vendor orders
      await Promise.all(vendorOrders.map(order => order.save()));
  
      // Clear cart for COD immediately
      if (paymentMethod !== 0) {
        await Cart.findOneAndDelete({ userId });
      }
  
      // If Razorpay, create Razorpay order
      if (paymentMethod === 0) {
        try {
          // Create Razorpay order
          const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(order.total * 100), // Convert to paise
            currency: 'INR',
            receipt: order._id.toString(),
            notes: {
              orderId: order._id.toString(),
              customerName: user.name || '',
              customerEmail: user.email || '',
              customerPhone: user.phone || ''
            }
          });
  
          // Save Razorpay order ID to our order
          order.payment.razorpayOrderId = razorpayOrder.id;
          await order.save();
  
          return res.json({
            success: true,
            paymentMethod: 'razorpay',
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id,
            amount: order.total
          });
        } catch (razorpayError) {
          console.error("Razorpay order creation error:", razorpayError);
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to create payment order',
            error: razorpayError.message 
          });
        }
      } else {
        // For COD
        return res.json({
          success: true,
          paymentMethod: 'cod',
          orderId: order._id
        });
      }
    } catch (error) {
      console.error('Place order error:', error);
      res.status(500).json({ success: false, message: 'Failed to place order' });
    }
});

// Verify Razorpay payment
router.post('/checkout/verify-payment', isUserAuthenticated, async (req, res) => {
    try {
      const {
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        order_id
      } = req.body;
  
      // Verify the payment signature
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');
  
      const isSignatureValid = generatedSignature === razorpay_signature;
  
      if (!isSignatureValid) {
        console.error('Invalid signature');
        return res.status(400).json({ success: false, message: 'Invalid payment signature' });
      }
  
      // Update order payment status
      const order = await Order.findById(order_id);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
  
      order.payment.status = 'Paid';
      order.payment.transactionId = razorpay_payment_id;
      order.payment.razorpayOrderId = razorpay_order_id;
      order.payment.razorpaySignature = razorpay_signature;
      order.status = 'Placed';
      order.statusHistory.push({
        status: 'Placed',
        date: new Date(),
        note: 'Payment successful'
      });
  
      await order.save();
  
      // Also update payment status in all associated vendor orders
      await VendorOrder.updateMany(
        { 'orderDetails.customerId': req.user.id, 
          createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Orders created in the last 5 minutes
        },
        { 'orderDetails.paymentStatus': 'Paid' }
      );
  
      // Clear cart after successful order
      await Cart.findOneAndUpdate(
        { userId: req.session.user.id },
        { items: [], subtotal: 0, shipping: 0, discount: 0, total: 0 }
      );
  
      return res.json({ 
        success: true, 
        message: 'Payment verified successfully',
        orderId: order._id 
      });
    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({ success: false, message: 'Payment verification failed' });
    }
  });

// Order confirmation page
router.get('/checkout/order-confirmation/:orderId', isUserAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    
    if (!order || order.userId.toString() !== req.session.user.id) {
      req.flash('error', 'Order not found');
      return res.redirect('/orders');
    }


    res.render('user/order-confermation', {
      title: 'Order Confirmation',
      order
    });
  } catch (error) {
    console.error('Order confermation error:', error);
    res.redirect('/orders');
  }
});


// GET order status page
router.get("/orderstatus", isUserAuthenticated, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const orderId = req.query.orderId || null;
  
      const orders = await Order.find({ userId }).sort({ createdAt: -1 }).lean();
      const order = orderId
        ? orders.find(o => o._id.toString() === orderId)
        : orders[0];
  
      if (!order) {
        return res.render("user/orderstatus", {
          order: null,
          orders: [],
          vendorOrders: [],
          message: "No orders found."
        });
      }
  
      const vendorOrders = await VendorOrder.find({ customerOrderId: order._id })
        .populate('vendorId', 'name email phone')
        .populate('items.productId', 'name description image price')
        .populate('deliveryPartner')
        .lean();
  
      const allItems = vendorOrders.flatMap(vendorOrder => {
        return vendorOrder.items.map(item => ({
          name: item.productId?.name || "Product",
          description: item.productId?.description || "",
          image: item.productId?.image || null,
          quantity: item.quantity,
          price: item.productId?.price || 0,
        }));
      });
  
      const total = allItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
      const finalOrder = {
        orderId: order._id,
        products: allItems,
        total,
        estimatedDelivery: order.estimatedDelivery || 'N/A',
        status: order.status
      };
  
      res.render("user/orderstatus", {
        order: finalOrder,
        orders,
        vendorOrders,
        message: req.query.message || null
      });
  
    } catch (err) {
      console.error("Order status route error:", err);
      res.status(500).send("Error loading order status");
    }
  });
  
  // POST cancel order
  router.post("/cancel-order", isUserAuthenticated, async (req, res) => {
    try {
      const { orderId } = req.body;
  
      const order = await Order.findOne({ _id: orderId, userId: req.session.user.id });
  
      if (!order || order.status !== "Placed") {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel this order."
        });
      }
  
      order.status = "Cancelled";
  
      if (Array.isArray(order.products)) {
        order.products = order.products.map(product => {
          const productObj = typeof product.toObject === 'function' ? product.toObject() : product;
          return {
            ...productObj,
            status: "Cancelled"
          };
        });
      }
  
      await order.save();

       // Find the VendorOrder related to this order and update the status
    const vendorOrder = await VendorOrder.findOne({ customerOrderId: orderId });

    if (vendorOrder) {
      // Update the vendor order's orderStatus to 'Cancelled'
      vendorOrder.orderDetails.orderStatus = "Cancelled";

      // Save the updated vendor order
      await vendorOrder.save();
    }
  
      return res.json({
        success: true,
        message: "Order cancelled successfully."
      });
  
    } catch (err) {
      console.error("Cancel order error:", err);
      return res.status(500).json({
        success: false,
        message: "Something went wrong."
      });
    }
  });
  
  
  
 
module.exports = router;



