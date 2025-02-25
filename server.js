require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const http = require("http"); // Import HTTP module

const app = express();
const server = http.createServer(app); // Move this after initializing app
const io = new Server(server, { cors: { origin: "https://hair-specialist.vercel.app" } });

app.use(express.json());

// Configure CORS to allow your frontend domain
const corsOptions = {
    origin: "https://hair-specialist.vercel.app", // Allow only your frontend
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true
};
app.use(cors(corsOptions)); // Apply CORS

// Supabase Config
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Secret Key for JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });

        req.user = user; // Attach user info to request
        next();
    });
};

// ✅ **Real-time chat setup**
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Handle user joining a chat room
    socket.on("joinRoom", ({ customerId, specialistId }) => {
        const roomId = [customerId, specialistId].sort().join("_");
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
    });

    // Handle sending messages
    socket.on("sendMessage", async ({ senderId, receiverId, message }) => {
        const roomId = [senderId, receiverId].sort().join("_");

        // Save message to Supabase
        const { data, error } = await supabase
            .from("messages")
            .insert([{ sender_id: senderId, receiver_id: receiverId, content: message }])
            .select();

        if (error) {
            console.error("Error saving message:", error);
            return;
        }

        // Emit the message to the room
        io.to(roomId).emit("receiveMessage", { senderId, receiverId, message, timestamp: new Date().toISOString() });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// ✅ **API Route to Fetch Chat History**
app.get("/api/chat/:customerId/:specialistId", authenticateToken, async (req, res) => {
    const { customerId, specialistId } = req.params;

    try {
        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .or(`sender_id.eq.${customerId},receiver_id.eq.${customerId}`)
            .or(`sender_id.eq.${specialistId},receiver_id.eq.${specialistId}`)
            .order("created_at", { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ **Start the Server**
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
