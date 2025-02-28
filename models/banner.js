// models/Banner.js
const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  superkey: {
    type: String,
    required: true,
    unique: true
  },
  images: {
    url: [String],
    title: [String],
    description: [String]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Banner', bannerSchema);