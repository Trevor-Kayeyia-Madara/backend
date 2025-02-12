/* eslint-disable no-undef */
require("dotenv").config({ path: "../.env" });

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Routes
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to The Online Hair Specialist Finder Backend!");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
