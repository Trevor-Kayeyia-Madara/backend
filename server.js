require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ✅ Configure CORS
const corsOptions = {
    origin: ["https://hair-specialist.vercel.app", "http://localhost:5173"], // Allow both production and local frontend
    methods: "GET,POST,PUT,DELETE,PATCH",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Supabase Config
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ✅ JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ Middleware to Authenticate Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });

        req.user = user;
        next();
    });
};

// ✅ Validate Session
app.get("/api/validate-session", authenticateToken, async (req, res) => {
    const { data: user, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("id", req.user.id)
        .single();

    if (error || !user) {
        return res.status(404).json({ message: "User not found." });
    }
      // ✅ Fetch `customer_id`
    const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .single();

if (customerError) {
    return res.status(500).json({ message: "Failed to fetch customer ID" });
}

res.status(200).json({ loggedIn: true, user, customerId: customer.id });
});

// ✅ User Login
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    const { data: user, error } = await supabase
        .from("users")
        .select("id, email, password, userType")
        .eq("email", email)
        .single();

    if (error || !user || password !== user.password) {
        return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "2h" });
    res.status(200).json({ message: "Login successful", userType: user.userType, token, id: user.id });
});

// ✅ User Signup (with plain password)
app.post('/api/signup', async (req, res) => {
    const { full_name, email, password, userType, phone_number, address, speciality, service_rates, location, rating, opening_time, closing_time } = req.body;
    
    console.log("Received Signup Data:", req.body);  // Debug received data
    console.log("User Type:", userType);  // Ensure userType is correct

    if (!full_name || !email || !password || !userType) {
        console.log("Validation Failed: Missing required fields.");
        return res.status(400).json({ message: "All required fields must be filled." });
    }

    const { data: existingUser, error: existingUserError } = await supabase
        .from("users")
        .select("email")
        .eq("email", email)
        .single();

    if (existingUser) {
        return res.status(400).json({ message: "Email already registered." });
    }

    // ⛔️ Removed hashedPassword, storing password in plain text
    const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert([{ full_name, email, password, userType }])
        .select("id, email, userType")
        .single();

    if (userError) {
        console.error("User Insert Error:", userError);
        return res.status(500).json({ message: "Error creating user.", error: userError });
    }

    console.log("New User Created:", newUser);

    if (userType === 'customer') {
        const { error: customerError } = await supabase
        .from("customers")
        .insert([{ user_id: newUser.id, phone_number, address }]);

        if (customerError) {
            console.error("Customer Insert Error:", customerError);
            return res.status(500).json({ message: "Error inserting customer data.", error: customerError });
        }
    } else if (userType === 'specialist') {
        const { error: specialistError } = await supabase
        .from("specialist_profile")
        .insert([{ 
            user_id: newUser.id, 
            speciality, 
            service_rates, 
            location, 
            rating, 
            opening_time, 
            closing_time 
        }]);

        if (specialistError) {
            console.error("Specialist Insert Error:", specialistError);
            return res.status(500).json({ message: "Error inserting specialist data.", error: specialistError });
        }
    }

    const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: "2h" });
    res.status(201).json({ message: "User registered successfully", token, userType: newUser.userType });
});


// ✅ Fetch User by ID
app.get("/api/users/:id", authenticateToken, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { data: user, error } = await supabase
        .from("users")
        .select("id, full_name, email, userType")
        .eq("id", userId)
        .single();

    if (error || !user) {
        return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json(user);
});

app.get("/api/customers/:id", authenticateToken, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);

    const { data: customer, error } = await supabase
        .from("customers")
        .select("user_id, phone_number, address, users(full_name)")
        .eq("user_id", customerId)
        .single();

    if (error || !customer) {
        return res.status(404).json({ error: "Customer not found." });
    }

    res.status(200).json({
        user_id: customer.user_id,
        phone_number: customer.phone_number,
        address: customer.address,
        full_name: customer.users.full_name
    });
});


app.get("/api/specialists", async (req, res) => {
    try {
        const { search } = req.query; // Get search query

        let query = supabase
            .from("specialist_profile")
            .select("id, speciality, service_rates, rating, location, opening_time, closing_time, created_at, users!inner (full_name)")
            .order("id", { ascending: true });

        // Apply search filter if present
        if (search) {
            query = query.or(`speciality.ilike.%${search}%,location.ilike.%${search}%`);
        }

        const { data: specialists, error } = await query;

        if (error) {
            return res.status(500).json({ message: "Error fetching specialists.", error });
        }

        // Format response
        const formattedSpecialists = specialists.map(spec => ({
            id: spec.id,
            speciality: spec.speciality,
            service_rates: spec.service_rates,
            rating: spec.rating,
            location: spec.location,
            opening_time: spec.opening_time,
            closing_time: spec.closing_time,
            created_at: spec.created_at,
            full_name: spec.users?.full_name
        }));

        res.status(200).json(formattedSpecialists);
    } catch (error) {
        res.status(500).json({ message: "Server error while fetching specialists." });
    }
});


app.get("/api/specialists/user/:user_id", async (req, res) => {
    const userId = parseInt(req.params.user_id, 10);

    const { data: specialist, error } = await supabase
        .from("specialist_profile")
        .select("id, user_id, speciality, service_rates, location, rating, users(full_name)")
        .eq("user_id", userId)  // ✅ Corrected query to use user_id
        .single();

    if (error || !specialist) {
        return res.status(404).json({ error: "Specialist profile not found." });
    }

    res.json({
        id: specialist.id,
        speciality: specialist.speciality,
        service_rates: specialist.service_rates,
        location: specialist.location,
        rating: specialist.rating,
        full_name: specialist.users.full_name
    });
});

app.put("/api/specialists/user/:user_id", async (req, res) => {
    const userId = parseInt(req.params.user_id, 10);
    const { speciality, service_rates, location, rating } = req.body;  

    // Update query based on user_id
    const { data, error } = await supabase
        .from("specialist_profile")
        .update({
            speciality,
            service_rates,
            location,
            rating
        })
        .eq("user_id", userId)
        .select();  // Returns updated data

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    if (!data || data.length === 0) {
        return res.status(404).json({ error: "Specialist profile not found." });
    }

    res.json({ message: "Profile updated successfully", specialist: data[0] });
});


app.get("/api/specialists/:id", async (req, res) => {
    const specialistId = parseInt(req.params.id, 10);

    const { data: specialist, error } = await supabase
        .from("specialist_profile")
        .select("id, user_id, speciality, service_rates, location, rating, users(full_name)")
        .eq("id", specialistId)
        .single();

    if (error || !specialist) {
        return res.status(404).json({ error: "Specialist profile not found." });
    }

    res.json({
        id: specialist.id,
        speciality: specialist.speciality,
        service_rates: specialist.service_rates,
        location: specialist.location,
        rating: specialist.rating,
        full_name: specialist.users.full_name
    });
});


// ✅ Update Specialist Profile
app.patch("/api/specialists/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const { full_name, email, speciality, service_rates, location } = req.body;

    if (!id || isNaN(id)) {
        return res.status(400).json({ error: "Invalid specialist ID." });
    }

    const { data, error } = await supabase
        .from("specialist_profile")
        .update({ full_name, email, speciality, service_rates, location, updated_at: new Date() })
        .eq("id", id)
        .select();

    if (error) {
        return res.status(500).json({ error: "Failed to update profile." });
    }

    res.json({ message: "Profile updated successfully.", data });
});

// API to fetch services offered by a specific specialist
app.get("/api/specialists/:id/services", async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
        .from("services")
        .select("id, name, description, prices")
        .eq("speciality_id", id);

    if (error) {
        return res.status(500).json({ error: "Error fetching services." });
    }

    res.json(data);
});
app.get("/api/appointments/:id", async (req, res) => {
    const appointmentId = parseInt(req.params.id, 10);

    // Fetch appointment details from the database
    const { data: appointment, error } = await supabase
        .from("appointments")
        .select("id, customer_id, specialist_id, service_id, date, time, status")
        .eq("id", appointmentId)
        .single();

    if (error || !appointment) {
        return res.status(404).json({ error: "Appointment not found." });
    }

    res.status(200).json(appointment);
});

// ✅ Fetch Appointments by User ID (Joining Specialist Profile)
app.get("/api/appointments/user/:user_id", authenticateToken, async (req, res) => {
    const userId = parseInt(req.params.user_id, 10);

    if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid User ID." });
    }

    try {
        // Step 1: Get Specialist ID from specialist_profile
        const { data: specialist, error: specialistError } = await supabase
            .from("specialist_profile")
            .select("id")
            .eq("user_id", userId)
            .single();

        if (specialistError || !specialist) {
            return res.status(404).json({ message: "Specialist profile not found." });
        }

        const specialistId = specialist.id;

        // Step 2: Fetch Appointments using Specialist ID
        const { data: appointments, error: appointmentsError } = await supabase
            .from("appointments")
            .select(`
                id,
                date,
                time,
                status,
                customers!inner(user_id, users(full_name)),
                services(name)
            `)
            .eq("specialist_id", specialistId)
            .order("date", { ascending: true })
            .order("time", { ascending: true });

        if (appointmentsError) {
            return res.status(500).json({ message: "Error fetching appointments.", error: appointmentsError });
        }

        if (!appointments || appointments.length === 0) {
            return res.status(404).json({ message: "No appointments found for this specialist." });
        }

      // Step 3: Format response
      const formattedAppointments = appointments.map((appointment) => ({
        id: appointment.id,
        customer_name: appointment.customers?.users?.full_name || "Unknown",
        service: appointment.services?.name || "Unknown",
        date: appointment.date,
        time: appointment.time,
        status: appointment.status,
      }));

      return res.status(200).json(formattedAppointments);
    } catch (error) {
      console.error("Server Error:", error);
      return res.status(500).json({ message: "Internal Server Error." });
    }
  }
);

app.post("/api/appointments", async (req, res) => {
  const { customer_id, specialist_id, service_id, date, time, status } =
    req.body;

  console.log("Incoming booking request:", req.body);

  if (
    !customer_id ||
    !date ||
    !time ||
    !specialist_id ||
    !service_id ||
    !status
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    // 1. Fetch specialist profile to get working hours and speciality
    const { data: specialist, error: specialistError } = await supabase
      .from("specialist_profile")
      .select("opening_time, closing_time, speciality")
      .eq("id", specialist_id)
      .single();

    if (specialistError || !specialist) {
      console.log("Specialist profile not found.");
      return res.status(404).json({ error: "Specialist profile not found." });
    }

    console.log("Specialist info:", specialist);

    // 2. Check if time is within working hours
    const selectedHour = parseInt(time.split(":")[0]);
    const openingHour = parseInt(specialist.opening_time.split(":")[0]);
    const closingHour = parseInt(specialist.closing_time.split(":")[0]);

    if (selectedHour < openingHour || selectedHour >= closingHour) {
      return res.status(400).json({
        error: `Appointment time must be between ${specialist.opening_time} and ${specialist.closing_time}`,
      });
    }

    // 3. Fetch duration of service based on specialist's speciality
    // Normalize speciality for matching
    const specialistSpeciality = specialist.speciality.trim().toLowerCase();
    console.log(`Normalized specialist speciality: "${specialistSpeciality}"`);

    // Fetch all service timings and find match manually
    const { data: allTimings, error: timingError } = await supabase
      .from("timing")
      .select("services, hours");

    if (timingError || !allTimings || allTimings.length === 0) {
      console.log("No service timings found.");
      console.log("All timings from DB:", allTimings);

      return res.status(400).json({ error: "Service timings not available." });
    }

    console.log("All timings from DB:");
    allTimings.forEach((t, index) => {
      console.log(`[${index}] Service: "${t.services}", Hours: ${t.hours}`);
    });

    // Match by trimming and lowercasing both sides
    const matchedTiming = allTimings.find(
      (t) => t.services?.trim().toLowerCase() === specialistSpeciality
    );

    // Logging comparison for debugging
    allTimings.forEach((t, index) => {
      const normalizedService = t.services?.trim().toLowerCase();
      console.log(
        `[${index}] Comparing "${normalizedService}" with "${specialistSpeciality}" → Match: ${
          normalizedService === specialistSpeciality
        }`
      );
    });

    if (!matchedTiming) {
      console.log("Service timing not found for this speciality.");
      return res
        .status(400)
        .json({ error: "Service timing not found for this speciality." });
    }

    const durationHours = parseFloat(matchedTiming.hours);
    console.log("Service duration (in hours):", durationHours);

    // 4. Calculate appointment start and end time
    const appointmentStart = new Date(`${date}T${time}`);
    const appointmentEnd = new Date(
      appointmentStart.getTime() + durationHours * 60 * 60 * 1000
    );

    console.log("Calculated Start Time:", appointmentStart.toISOString());
    console.log("Calculated End Time:", appointmentEnd.toISOString());

    // 5. Check for overlapping appointments in Appointment_Period
    // 5. Check for overlapping appointments in Appointment_Period
    const { data: overlaps, error: overlapError } = await supabase
      .from("appointment_period")
      .select("*")
      .eq("Specialist_Id", specialist_id)
      .lt("Start_time", appointmentEnd.toISOString()) // Less than End Time
      .gt("End_time", appointmentStart.toISOString()); // Greater than Start Time

    if (overlapError) {
      console.error("Error checking overlaps:", overlapError);
      return res
        .status(500)
        .json({ error: "Error checking existing appointments." });
    }

    if (overlaps.length > 0) {
      console.log("Booking rejected due to overlap.");
      return res
        .status(409)
        .json({ error: "Time slot overlaps with an existing appointment." });
    }

    // 6. Insert into appointments
    const { data: newAppointment, error: insertError } = await supabase
      .from("appointments")
      .insert([
        {
          customer_id,
          specialist_id,
          service_id,
          date,
          time,
          status,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting appointment:", insertError);
      return res.status(500).json({ error: "Failed to create appointment." });
    }

    // 7. Insert into Appointment_Period
    const periodInsertResult = await supabase
  .from("appointment_period")
  .insert([
    {
      Specialist_Id: specialist_id,
      Start_time: appointmentStart,
      End_time: appointmentEnd,
    },
  ]);

console.log("Step 7 Insert Result:", periodInsertResult);

if (periodInsertResult.error) {
  console.error("Error inserting appointment period:", periodInsertResult.error);
  return res
    .status(500)
    .json({ error: "Failed to save appointment time range." });
}


    console.log("Appointment successfully created.");
    return res.status(201).json({ appointment: newAppointment });
  } catch (err) {
    console.error("Unhandled booking error:", err);
    return res
      .status(500)
      .json({ error: "Server error while booking appointment." });
  }
});

app.get("/api/specialists/:id/availability", async (req, res) => {
  const specialist_id = req.params.id;
  const { date } = req.query;

  if (!date) {
    return res
      .status(400)
      .json({ error: "Date is required in the query parameter." });
  }

  try {
    // 1. Get specialist working hours
    const { data: specialist, error: profileError } = await supabase
      .from("specialist_profile")
      .select("opening_time, closing_time")
      .eq("id", specialist_id)
      .single();

    if (profileError || !specialist) {
      return res.status(404).json({ error: "Specialist not found." });
    }

    const openingHour = parseInt(specialist.opening_time.split(":")[0]);
    const closingHour = parseInt(specialist.closing_time.split(":")[0]);

    // 2. Get all booked times for that date
    const { data: appointments, error: appointmentError } = await supabase
      .from("appointments")
      .select("time")
      .eq("specialist_id", specialist_id)
      .eq("date", date);

    if (appointmentError) {
      return res.status(500).json({ error: "Error fetching appointments." });
    }

    const bookedTimes = appointments.map((a) => a.time.split(":")[0]);

    // 3. Build list of available hours
    const allSlots = [];
    for (let hour = openingHour; hour < closingHour; hour++) {
      const padded = hour.toString().padStart(2, "0") + ":00";
      if (!bookedTimes.includes(hour.toString())) {
        allSlots.push(padded);
      }
    }

    return res.json({
      date,
      specialist_id,
      available_slots: allSlots,
    });
  } catch (err) {
    console.error("Availability check error:", err);
    return res
      .status(500)
      .json({ error: "Server error checking availability." });
  }
});


app.post("/api/appointments", async (req, res) => {
    const { user_id, specialist_id, service_id, date, time, status } = req.body;

    // Validate all required fields
    if (!user_id || !date || !time || !specialist_id || !service_id || !status) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        // Fetch specialist working hours
        const { data: specialist, error: specialistError } = await supabase
            .from("specialist_profile")
            .select("opening_time, closing_time")
            .eq("id", specialist_id)
            .single();

        if (specialistError || !specialist) {
            return res.status(404).json({ error: "Specialist profile not found." });
        }

        // Parse working hours and appointment time
        const selectedHour = parseInt(time.split(":")[0]);
        const openingHour = parseInt(specialist.opening_time.split(":")[0]);
        const closingHour = parseInt(specialist.closing_time.split(":")[0]);

        if (selectedHour < openingHour || selectedHour >= closingHour) {
            return res.status(400).json({
                error: `Appointment time must be between ${specialist.opening_time} and ${specialist.closing_time}`,
            });
        }

        // Check for appointment clashes
        const { data: existingAppointment, error: clashError } = await supabase
            .from("appointments")
            .select("*")
            .eq("specialist_id", specialist_id)
            .eq("date", date)
            .eq("time", time)
            .maybeSingle();

        if (clashError) {
            return res.status(500).json({ error: "Error checking existing appointments." });
        }

        if (existingAppointment) {
            return res.status(409).json({ error: "Time slot already booked. Please choose another time." });
        }

        // Create new appointment
        const { data: newAppointment, error: insertError } = await supabase
            .from("appointments")
            .insert([
                {
                    user_id,
                    specialist_id,
                    service_id,
                    date,
                    time,
                    status,
                },
            ])
            .select()
            .single();

        if (insertError) {
            return res.status(500).json({ error: "Failed to create appointment." });
        }

        return res.status(201).json({ appointment: newAppointment });

    } catch (err) {
        console.error("Appointment error:", err);
        return res.status(500).json({ error: "Server error while booking appointment." });
    }
});


app.get("/api/specialists/:id/availability", async (req, res) => {
    const specialist_id = req.params.id;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: "Date is required in the query parameter." });
    }

    try {
        // 1. Get specialist working hours
        const { data: specialist, error: profileError } = await supabase
            .from("specialist_profile")
            .select("opening_time, closing_time")
            .eq("id", specialist_id)
            .single();

        if (profileError || !specialist) {
            return res.status(404).json({ error: "Specialist not found." });
        }

        const openingHour = parseInt(specialist.opening_time.split(":")[0]);
        const closingHour = parseInt(specialist.closing_time.split(":")[0]);

        // 2. Get all booked times for that date
        const { data: appointments, error: appointmentError } = await supabase
            .from("appointments")
            .select("time")
            .eq("specialist_id", specialist_id)
            .eq("date", date);

        if (appointmentError) {
            return res.status(500).json({ error: "Error fetching appointments." });
        }

        const bookedTimes = appointments.map(a => a.time.split(":")[0]);

        // 3. Build list of available hours
        const allSlots = [];
        for (let hour = openingHour; hour < closingHour; hour++) {
            const padded = hour.toString().padStart(2, "0") + ":00";
            if (!bookedTimes.includes(hour.toString())) {
                allSlots.push(padded);
            }
        }

        return res.json({
            date,
            specialist_id,
            available_slots: allSlots,
        });

    } catch (err) {
        console.error("Availability check error:", err);
        return res.status(500).json({ error: "Server error checking availability." });
    }
});


app.post("/api/reviews", authenticateToken, async (req, res) => {
    const { customer_id, specialist_id, rating, review } = req.body;

    if (!customer_id|| !specialist_id || !rating || !review) {
        return res.status(400).json({ error: "All fields are required." });
    }
    if (!rating || rating < 1.0 || rating > 5.0) {
        return res.status(400).json({ error: "Rating must be between 1.0 and 5.0" });
    }
    
    try {
        // ✅ Insert review into Supabase (Use correct column name `review`)
        const { data: reviewData, error: reviewError } = await supabase
            .from("reviews")
            .insert([{ customer_id, specialist_id, rating, review }]) // ✅ Fix column name here
            .select()
            .single();

        if (reviewError) {
            return res.status(500).json({ error: "Failed to save review.", details: reviewError.message });
        }

        // ✅ Calculate new average rating for the specialist
        const { data: reviews, error: fetchError } = await supabase
            .from("reviews")
            .select("rating")
            .eq("specialist_id", specialist_id);

        if (fetchError) {
            return res.status(500).json({ error: "Failed to calculate rating.", details: fetchError.message });
        }

        const totalRatings = reviews.length;
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

        // ✅ Update specialist rating
        const { error: updateError } = await supabase
            .from("specialist_profile")
            .update({ rating: avgRating })
            .eq("id", specialist_id);

        if (updateError) {
            return res.status(500).json({ error: "Failed to update specialist rating.", details: updateError.message });
        }

        res.status(201).json({ message: "Review submitted successfully!", review: reviewData });
    } catch (error) {
        res.status(500).json({ error: "Server error submitting review.", details: error.message });
    }
});

app.get("/api/reviews", async (req, res) => {
    try {
        const { data: reviews, error } = await supabase
            .from("reviews")
            .select("id, rating, review, created_at, specialist_profile!inner(user_id, users!inner(full_name))")
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({ error: "Error fetching reviews.", details: error.message });
        }

        // Map reviews to include specialist name
        const formattedReviews = reviews.map(review => ({
            id: review.id,
            rating: review.rating,
            review: review.review,
            created_at: review.created_at,
            specialist_name: review.specialist_profile.users.full_name
        }));

        res.status(200).json(formattedReviews);
    } catch (error) {
        res.status(500).json({ error: "Server error while fetching reviews.", details: error.message });
    }
});


app.get("/api/reviews/:customer_id/:specialist_id", async (req, res) => {
    const { customer_id, specialist_id } = req.params;

    try {
        const { data: review, error } = await supabase
            .from("reviews")
            .select(
                "id, rating, review, created_at, specialist_profile!inner(user_id, users!inner(full_name))"
            )
            .eq("customer_id", customer_id)
            .eq("specialist_id", specialist_id)
            .single();

        if (error && error.code !== "PGRST116") {
            return res.status(500).json({ error: "Error fetching review." });
        }

        if (!review) {
            return res.status(404).json({ message: "No review found." });
        }

        res.status(200).json({
            id: review.id,
            rating: review.rating,
            review: review.review,
            created_at: review.created_at,
            specialist_name: review.specialist_profile.users.full_name,
        });
    } catch (error) {
        res.status(500).json({ error: "Server error while fetching review." });
    }
});

// ✅ Update Existing Review
app.put("/api/reviews", authenticateToken, async (req, res) => {
    const { customer_id, specialist_id, rating, review } = req.body;

    try {
        const { data, error } = await supabase
            .from("reviews")
            .update({ rating, review, created_at: new Date() })
            .eq("customer_id", customer_id)
            .eq("specialist_id", specialist_id)
            .select();

        if (error) {
            return res.status(500).json({ error: "Failed to update review." });
        }

        res.status(200).json({ message: "Review updated successfully!", data });
    } catch (error) {
        res.status(500).json({ error: "Server error updating review." });
    }
});

app.get("/api/appointments/specialist/:specialistId", authenticateToken, async (req, res) => {
    const specialistId = parseInt(req.params.specialistId, 10);

    try {
        const { data: appointments, error } = await supabase
            .from("appointments")
            .select("id, date, time, status, user_id") // Also return user_id to map to clients
            .eq("specialist_id", specialistId)
            .order("date", { ascending: false });

        if (error) {
            console.error("Appointments Query Error:", error);
            return res.status(500).json({ error: "Failed to fetch appointments.", details: error.message });
        }

        // Fetch client names
        const userIds = appointments.map(app => app.user_id);
        const { data: users, error: userError } = await supabase
            .from("users")
            .select("id, full_name")
            .in("id", userIds);

        const usersMap = users?.reduce((acc, user) => {
            acc[user.id] = user.full_name;
            return acc;
        }, {}) || {};

        const response = appointments.map(app => ({
            id: app.id,
            date: app.date,
            time: app.time,
            status: app.status,
            client_name: usersMap[app.user_id] || "Unknown"
        }));

        res.status(200).json(response);
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error while fetching specialist appointments.", details: error.message });
    }
});


// CustomerID FETCH
app.get("/api/users/:id/appointments", authenticateToken, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    console.log(`Fetching appointments for user ID: ${userId}`); // ✅ Log request

    try {
        // Fetch appointments for the given user
        const { data: appointments, error: appointmentError } = await supabase
            .from("appointments")
            .select("id, date, time, status, specialist_id")
            .eq("user_id", userId)  // Changed from customer_id to user_id
            .order("date", { ascending: false });

        if (appointmentError) {
            console.error("Appointments Query Error:", appointmentError);
            return res.status(500).json({ error: "Failed to fetch appointments.", details: appointmentError.message });
        }

        if (!appointments || appointments.length === 0) {
            return res.status(200).json([]); // Return empty if no appointments found
        }

        // Extract specialist IDs
        const specialistIds = appointments.map(app => app.specialist_id);

        // Fetch specialist profiles
        const { data: specialists, error: specialistError } = await supabase
            .from("specialist_profile")
            .select("id, speciality, user_id")
            .in("id", specialistIds);

        if (specialistError) {
            console.error("Specialists Query Error:", specialistError);
            return res.status(500).json({ error: "Failed to fetch specialists.", details: specialistError.message });
        }

        // Extract user IDs
        const userIds = specialists.map(spec => spec.user_id);

        // Fetch user details
        const { data: users, error: userError } = await supabase
            .from("users")
            .select("id, full_name")
            .in("id", userIds);

        if (userError) {
            console.error("Users Query Error:", userError);
            return res.status(500).json({ error: "Failed to fetch user details.", details: userError.message });
        }

        // Map data together
        const specialistsMap = specialists.reduce((acc, spec) => {
            acc[spec.id] = { speciality: spec.speciality, user_id: spec.user_id };
            return acc;
        }, {});

        const usersMap = users.reduce((acc, user) => {
            acc[user.id] = user.full_name;
            return acc;
        }, {});

        const response = appointments.map(app => ({
            id: app.id,
            date: app.date,
            time: app.time,
            status: app.status,
            specialist_profile: {
                speciality: specialistsMap[app.specialist_id]?.speciality || "Unknown",
                full_name: usersMap[specialistsMap[app.specialist_id]?.user_id] || "Unknown"
            }
        }));

        res.status(200).json(response);
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error while fetching appointments.", details: error.message });
    }
});


//1️⃣ Get All Chats for a Specialist or Client
app.get("/api/chats/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    console.log(`Fetching chats for user ID: ${userId}`);

    try {
        let specialistId = null;
        let clientId = null;

        // 🔍 Check if the user is a specialist
        const { data: specialistProfile, error: specialistError } = await supabase
            .from("specialist_profile")
            .select("id")
            .eq("user_id", userId)
            .single();

        if (specialistError && specialistError.code !== "PGRST116") {
            console.error("Specialist Profile Query Error:", specialistError);
            return res.status(500).json({ error: "Error fetching specialist profile.", details: specialistError.message });
        }

        if (specialistProfile) {
            specialistId = specialistProfile.id;
            console.log(`User is a specialist with ID: ${specialistId}`);
        } else {
            // 🔍 If not a specialist, check if the user is a client
            const { data: customerProfile, error: customerError } = await supabase
                .from("customers")
                .select("id")
                .eq("user_id", userId)
                .single();

            if (customerError && customerError.code !== "PGRST116") {
                console.error("Customer Profile Query Error:", customerError);
                return res.status(500).json({ error: "Error fetching customer profile.", details: customerError.message });
            }

            if (customerProfile) {
                clientId = customerProfile.id;
                console.log(`User is a client with ID: ${clientId}`);
            }
        }

        // ❌ If neither client nor specialist
        if (!specialistId && !clientId) {
            return res.status(404).json({ error: "User not found as either client or specialist." });
        }

        // 🔍 Fetch chats for this user
        const { data: chats, error: chatsError } = await supabase
            .from("chats")
            .select("chat_id, client_id, specialist_id, created_at")
            .or(`client_id.eq.${clientId || -1},specialist_id.eq.${specialistId || -1}`)
            .order("created_at", { ascending: false });

        if (chatsError) {
            console.error("Chats Query Error:", chatsError);
            return res.status(500).json({ error: "Failed to fetch chats.", details: chatsError.message });
        }

        // 🔁 Enhance chat info with names and last message
        const chatsWithDetails = await Promise.all(
            chats.map(async (chat) => {
                let specialistName = "Unknown Specialist";
                let clientName = "Unknown Client";

                // 🔍 Get specialist user ID and name
                const { data: specialistProfile, error: specialistProfileError } = await supabase
                    .from("specialist_profile")
                    .select("user_id")
                    .eq("id", chat.specialist_id)
                    .single();

                if (!specialistProfileError && specialistProfile) {
                    const { data: specialist, error: specialistNameError } = await supabase
                        .from("users")
                        .select("full_name")
                        .eq("id", specialistProfile.user_id)
                        .single();

                    if (!specialistNameError && specialist) {
                        specialistName = specialist.full_name;
                    }
                }

                // 🔍 Get client user ID and name
                const { data: customer, error: customerError } = await supabase
                    .from("customers")
                    .select("user_id")
                    .eq("id", chat.client_id)
                    .single();

                if (!customerError && customer) {
                    const { data: client, error: clientNameError } = await supabase
                        .from("users")
                        .select("full_name")
                        .eq("id", customer.user_id)
                        .single();

                    if (!clientNameError && client) {
                        clientName = client.full_name;
                    }
                }

                // 🔍 Fetch last message for the chat
                const { data: lastMessage, error: lastMessageError } = await supabase
                    .from("messages")
                    .select("message, timestamp")
                    .eq("chat_id", chat.chat_id)
                    .order("timestamp", { ascending: false })
                    .limit(1)
                    .single();

                return {
                    ...chat,
                    specialist_name: specialistName,
                    client_name: clientName,
                    last_message: lastMessage?.message || "",
                    last_message_time: lastMessage?.timestamp || null,
                };
            })
        );

        res.status(200).json(chatsWithDetails);
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error while fetching chats.", details: error.message });
    }
});





// 2️⃣ Get Messages for a Chat
app.get("/api/chats/:chatId/messages", async (req, res) => {
    const chatId = parseInt(req.params.chatId, 10);
    console.log(`Fetching messages for chat ID: ${chatId}`);

    try {
        const { data: messages, error } = await supabase
            .from("messages")
            .select("message_id, chat_id, sender_id, message, timestamp")
            .eq("chat_id", chatId)
            .order("timestamp", { ascending: true });

        if (error) {
            console.error("Messages Query Error:", error);
            return res.status(500).json({ error: "Failed to fetch messages.", details: error.message });
        }

        res.status(200).json(messages);
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error while fetching messages.", details: error.message });
    }
});
// 3️⃣ Send a Message
app.post("/api/chats/:chatId/messages", async (req, res) => {
    const chatId = parseInt(req.params.chatId, 10);
    const { sender_id, message } = req.body;

    if (!sender_id || !message.trim()) {
        return res.status(400).json({ error: "Sender and message are required." });
    }

    try {
        const { error } = await supabase
            .from("messages")
            .insert([
                {
                    chat_id: chatId,
                    sender_id,
                    message,
                    timestamp: new Date().toISOString(), // ✅ Explicitly setting timestamp
                },
            ]);

        if (error) {
            console.error("Message Insert Error:", error);
            return res.status(500).json({ error: "Failed to send message.", details: error.message });
        }

        res.status(201).json({ success: true, message: "Message sent successfully." });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error while sending message.", details: error.message });
    }
});

// 4️⃣ Start a New Chat
app.post("/api/chats",  async (req, res) => {
    const { client_id, specialist_id } = req.body;

    if (!client_id || !specialist_id) {
        return res.status(400).json({ error: "Both client_id and specialist_id are required." });
    }

    try {
        // Check if chat already exists
        const { data: existingChat } = await supabase
            .from("chats")
            .select("chat_id")
            .eq("client_id", client_id)
            .eq("specialist_id", specialist_id)
            .maybeSingle();

        if (existingChat) {
            return res.status(200).json({ chat_id: existingChat.chat_id, message: "Chat already exists." });
        }

        // Create new chat
        const { data, error } = await supabase
            .from("chats")
            .insert([{ client_id, specialist_id }])
            .select("chat_id")
            .single();

        if (error) {
            console.error("Chat Insert Error:", error);
            return res.status(500).json({ error: "Failed to create chat.", details: error.message });
        }

        res.status(201).json({ chat_id: data.chat_id, message: "Chat created successfully." });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error while creating chat.", details: error.message });
    }
});
// Chat Create
app.post("/api/chats/create", async (req, res) => {
    const { client_id: clientUserId, specialist_id } = req.body;

    if (!clientUserId || !specialist_id) {
        return res.status(400).json({ error: "Client user ID and Specialist ID are required." });
    }

    try {
        console.log(`Creating or fetching chat between Client User ID: ${clientUserId} and Specialist ID: ${specialist_id}`);

        // 🔍 Get the actual client_id (from customers table using user_id)
        const { data: customerProfile, error: customerError } = await supabase
            .from("customers")
            .select("id")
            .eq("user_id", clientUserId)
            .single();

        if (customerError || !customerProfile) {
            console.error("Client ID Lookup Error:", customerError || "Client not found");
            return res.status(400).json({ error: "Invalid client user ID — no matching client found." });
        }

        const clientId = customerProfile.id;
        console.log(`Resolved client ID: ${clientId}`);

        // 1️⃣ Check if the chat already exists
        const { data: existingChat, error: existingError } = await supabase
            .from("chats")
            .select("chat_id")
            .eq("client_id", clientId)
            .eq("specialist_id", specialist_id)
            .single();

        if (existingError && existingError.code !== "PGRST116") {
            console.error("Chat Query Error:", existingError);
            return res.status(500).json({ error: "Failed to check existing chats.", details: existingError.message });
        }

        let chatId;
        if (existingChat) {
            console.log("Chat already exists:", existingChat);
            chatId = existingChat.chat_id;
        } else {
            // 2️⃣ Create a new chat
            const { data: newChat, error: createError } = await supabase
                .from("chats")
                .insert([{ client_id: clientId, specialist_id }])
                .select("chat_id")
                .single();

            if (createError) {
                console.error("Chat Creation Error:", createError);
                return res.status(500).json({ error: "Failed to create chat.", details: createError.message });
            }

            console.log("New chat created:", newChat);
            chatId = newChat.chat_id;
        }

        // 3️⃣ Fetch all chats involving this client
        const { data: chats, error: fetchError } = await supabase
            .from("chats")
            .select("chat_id, client_id, specialist_id, created_at")
            .or(`client_id.eq.${clientId},specialist_id.eq.${clientId}`)
            .order("created_at", { ascending: false });

        if (fetchError) {
            console.error("Error fetching updated chat list:", fetchError);
            return res.status(500).json({ error: "Failed to fetch updated chats.", details: fetchError.message });
        }

        res.status(200).json({ chat_id: chatId, chats });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error while creating or fetching chats.", details: error.message });
    }
});


// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));