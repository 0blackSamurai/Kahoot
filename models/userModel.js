const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: { type: String, required: true, unique: true }, // Username field
  epost: { type: String, required: true, unique: true }, // Email field
  passord: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'User', '1st Line', '2nd Line'], default: 'User' }
});

module.exports = mongoose.model('User', userSchema);