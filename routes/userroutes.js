const express = require("express");
const router = express.Router();
const Product = require("../models/product");

// Redirect "/user/" to "/user/home"
router.get("/", (req, res) => {
    res.redirect("/user/home");
});

// Homepage
router.get("/home", (req, res) => {
    res.render("user/userhome", { title: "User Home", activePage: "home" });
});

// Menu Page
router.get("/menu", (req, res) => {
    res.render("user/menu", { title: "Menu", activePage: "menu" });
});

// About Page
router.get("/about", (req, res) => {
    res.render("user/about", { title: "About", activePage: "about" });
});

module.exports = router;
