/* eslint-disable no-undef */
const express = require("express");
const { signUp, signInWithPassword } = require("../controllers/authController");

const router = express.Router();

router.post("/signup", signUp);
router.post("/login", signInWithPassword);

module.exports = router;
