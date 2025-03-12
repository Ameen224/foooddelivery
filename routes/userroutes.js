const express = require("express");
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const session = require("express-session");

// Import models
const Product = require("../models/product");
const Banner = require("../models/banner");
const Vendor = require("../models/vendor");
const Contact = require('../models/contact');
const Category = require("../models/category");
const User = require('../models/user');
const Cart = require('../models/cart');


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

// Middleware for authentication
const isAuthenticated = (req, res, next) => {
    if (!req.session?.user) {
        console.log("User not authenticated");
        return res.redirect('/user/login');
    }
    req.user = { ...req.session.user, _id: req.session.user.id }; // Ensure _id is available
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
                description: bannerData.images.description[index] || "No Description"
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

// Login route
router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).json({ message: "Email/Phone and Password are required!" });
        }

        const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
        if (!user) {
            return res.status(400).json({ message: "User not found!" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials!" });
        }

        req.session.user = { 
            id: user._id.toString(), 
            name: user.name, 
            email: user.email, 
            phone: user.phone 
        };
        
        req.session.save(err => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(500).json({ message: "Session error" });
            }
            res.status(200).json({ message: "Login successful!", user: req.session.user });
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// User profile route
router.get("/profile", isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        res.render("user/profile", { user });
    } catch (err) {
        console.error("Profile route error:", err);
        res.status(500).send("Error loading profile");
    }
});

// Profile update route
router.post("/profile/update", isAuthenticated, async (req, res) => {
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
router.post("/profile/address", isAuthenticated, async (req, res) => {
    try {
        const { id, type, street, city, state, zip, country } = req.body;
        
        if (!type || !street || !city || !state || !zip || !country) {
            return res.status(400).json({ 
                success: false, 
                message: "All address fields are required" 
            });
        }
        
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (id) {
            const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === id);
            if (addressIndex !== -1) {
                user.addresses[addressIndex] = { 
                    _id: id, 
                    type, 
                    street, 
                    city, 
                    state, 
                    zip, 
                    country, 
                    isDefault: user.addresses[addressIndex].isDefault 
                };
            } else {
                return res.status(404).json({ success: false, message: "Address not found" });
            }
        } else {
            const isDefault = user.addresses.length === 0; // First address is default
            user.addresses.push({ type, street, city, state, zip, country, isDefault });
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
router.post("/profile/address/default", isAuthenticated, async (req, res) => {
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
router.post("/profile/address/delete", isAuthenticated, async (req, res) => {
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



// Get Cart Items
router.get('/cart', isAuthenticated, async (req, res) => {
    const userId = req.user._id;  // Assume user is logged in
    let cart = await Cart.findOne({ userId });


    // Ensure cart is always an object with default values
    if (!cart) {
        cart = { items: [], subtotal: 0, shipping: 5, tax: 0, total: 0 };
    }


    res.render('user/cart', { cart });
});


// Add Item to Cart
router.post('/cart/add', isAuthenticated, async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.user._id;

        // Find the product to get its details
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
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

        // Recalculate cart totals
        cart.subtotal = cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
        
        // Calculate tax (e.g., 10%)
        cart.tax = cart.subtotal * 0.1;
        
        // Calculate total
        cart.total = cart.subtotal + cart.tax + cart.shipping;

        await cart.save();

        res.json({ success: true, cart });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});



// Update Quantity
router.post('/cart/update',isAuthenticated, async (req, res) => {
    const { itemId, quantity } = req.body;
    const userId = req.user._id;
    
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: false, message: "Cart not found" });
    
    const item = cart.items.find(item => item._id.toString() === itemId);
    if (item) item.quantity = quantity;
    
    cart.subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cart.tax = cart.subtotal * 0.1;
    cart.total = cart.subtotal + cart.shipping + cart.tax;
    
    await cart.save();
    res.json({ success: true });
});

// Remove Item
router.post('/cart/remove',isAuthenticated, async (req, res) => {
    const { itemId } = req.body;
    const userId = req.user._id;
    
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: false, message: "Cart not found" });
    
    cart.items = cart.items.filter(item => item._id.toString() !== itemId);
    
    cart.subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cart.tax = cart.subtotal * 0.1;
    cart.total = cart.subtotal + cart.shipping + cart.tax;
    
    await cart.save();
    res.json({ success: true });
});


module.exports = router;