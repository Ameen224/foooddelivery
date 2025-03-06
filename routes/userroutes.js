const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Product = require("../models/product");
const Banner = require("../models/banner");
const vendor = require("../models/vendor");
const Contact = require('../models/contact');
const Category = require("../models/category")

// Home page route
router.get("/home", async (req, res) => {
    try {
      const bannerData = await Banner.findOne({ superkey: "1111" });
  
      // Ensure bannerData exists and has valid arrays before processing
      let banners = [];
      if (bannerData && bannerData.images && bannerData.images.url && bannerData.images.url.length) {
        banners = bannerData.images.url.map((url, index) => ({
          url,
          title: bannerData.images.title[index] || "No Title",
          description: bannerData.images.description[index] || "No Description"
        }));
      }
  
      // Fetch vendors from database
      const vendors = await vendor.find({ isApproved: true, isBlocked: false }).limit(8);
      
      // Fetch categories from database
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
        console.log("Vendor ID:", id);

        const vendorData = await vendor.findById(id);
        if (!vendorData) {
            console.log("Vendor not found");
            return res.status(404).send('Vendor not found');
        }

        const products = await Product.find({ vendorId: id });
        console.log("Products found:", products.length);

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
    // Validation rules
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Create new contact entry
        const { name, email, message } = req.body;
        const newContact = new Contact({
            name,
            email,
            message,
            date: new Date()
        });

        // Save to database
        await newContact.save();
        
        // Return success response
        return res.status(201).json({ 
            success: true, 
            message: 'Contact message saved successfully' 
        });
    } catch (error) {
        console.error('Contact submission error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error processing your request' 
        });
    }
});


// product detailse 

router.get("/product/:id", async(req,res)=>{
    try {
        console.log("id",req.params.id);
        
        const product= await Product.findById(req.params.id)
        if(!product)return res.status(404).send("product not found");
        res.render("user/product",{product})
    } catch (error) {
        res.status(500).send("error fetching product")
    }
})


// Route 1: Show restaurants offering the selected category
router.get("/category/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;

        // Find products in the given category and populate vendorId
        const products = await Product.find({ category: categoryId }).populate("vendorId");

        // Group products by vendor
        const vendors = {};
        products.forEach((product) => {
            if (product.vendorId) { // Ensure vendor exists
                if (!vendors[product.vendorId._id]) {
                    vendors[product.vendorId._id] = {
                        vendor: product.vendorId,
                        products: [],
                        featuredProductId: product._id // Add a featured product
                    };
                }
                vendors[product.vendorId._id].products.push(product);
            }
        });

        const vendorList = Object.values(vendors);

        // Render the category_vendors.ejs template
        res.render("user/category_vendors", { 
            vendorList, 
            categoryId,
            title: "Restaurants for Selected Category" 
        });
    } catch (error) {
        console.error("Error fetching vendors by category:", error);
        res.status(500).render("error", { 
            message: "Internal Server Error", 
            error: error 
        });
    }
});



//second one
router.get("/restaurant/:id/product/:productId?", async (req, res) => {
    try {
        const vendorId = req.params.id;
        const selectedProductId = req.params.productId;
        const categoryId = req.query.categoryId; // Add this to pass category information

        console.log("data",vendorId,selectedProductId,categoryId);
        

        // Get vendor details
        const vendordata = await vendor.findById(vendorId);
        console.log("vendor",vendordata);
        
        if (!vendordata) {
            return res.status(404).render("error", { message: "Restaurant not found" });
        }

        // Base query for products
        let productQuery = { vendorId: vendorId };

        // If categoryId is provided, first fetch category-specific products
        let categoryProducts = [];
        if (categoryId) {
            categoryProducts = await Product.find({ 
                vendorId: vendorId, 
                category: categoryId 
            }).lean();
        }

        // Fetch all products for the vendor
        let allProducts = await Product.find(productQuery)
            .populate('category') // Populate category details
            .lean();

        // Remove category products from all products to avoid duplicates
        const otherProducts = categoryId 
            ? allProducts.filter(p => 
                !categoryProducts.some(cp => cp._id.toString() === p._id.toString())
            ) 
            : allProducts;

        // Combine products with category items first
        const products = [...categoryProducts, ...otherProducts];

        // If a specific product was selected, move it to the top
        if (selectedProductId) {
            const selectedProductIndex = products.findIndex(p => 
                p._id.toString() === selectedProductId
            );
            
            if (selectedProductIndex > -1) {
                const selectedProduct = products.splice(selectedProductIndex, 1)[0];
                products.unshift(selectedProduct);
            }
        }

        res.render("user/restaurant_products", { 
            vendordata, 
            products,
            title: `${vendordata.restaurantName} - Products`,
            selectedCategoryId: categoryId // Pass this to the view for potential highlighting
        });

    } catch (error) {
        console.error("Error fetching restaurant details:", error);
        res.status(500).render("error", { message: "Internal Server Error", error });
    }
});


module.exports = router;