const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const app = express();
app.use(cors({
  origin: [
    "https://myfamily-tree-application.netlify.app",
    "http://localhost:5500"
  ]
}));
app.use(express.json());

const nodemailer = require("nodemailer");
const crypto = require("crypto");
const JWT_SECRET = process.env.JWT_SECRET;
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

app.get("/", (req, res) => {
  res.send("Family Tree API is LIVE 🚀");
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS          // 👈 app password
  }
});

// ==========================
// MongoDB Connection
// ==========================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("DB Error ❌", err));


// ==========================
// USER SCHEMA
// ==========================
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  // 🔥 NEW FIELDS
  resetToken: String,
  resetTokenExpiry: Date
}, { timestamps: true });

const User = mongoose.model("User", userSchema);


// ==========================
// PERSON SCHEMA
// ==========================
const personSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gender: { type: String, required: true },

  spouseId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", default: null },

  // ✅ CHANGE HERE
  fatherId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", default: null },
  motherId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", default: null },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  birthDate: Date,
  deathDate: Date,
  birthPlace: String,
  relationType: String,
  profilePic: { type: String, default: "" }
}, { timestamps: true });

const Person = mongoose.model("Person", personSchema);


// ==========================
// AUTH MIDDLEWARE
// ==========================
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token ❌" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token ❌" });
  }
}


// ==========================
// SIGNUP
// ==========================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email & Password required ❌" });
    }

    if (!name) {
      return res.status(400).json({ message: "Name required ❌" });
    }

    if (!email.includes("@")) {
      return res.status(400).json({ message: "Invalid email ❌" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters ❌" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User already exists ❌" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email : email.toLowerCase(),
      password: hashedPassword
    });

    await user.save();

    res.json({
      success: true,
      message: "User Created ✅"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================
// LOGIN
// ==========================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: "User not found ❌" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Wrong password ❌" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({
    success: true,
    token,
    name: user.name   // ✅ ADD THIS
  });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    // 🔐 SECURITY (same response)
    if (!user) {
      return res.json({
        success: true,
        message: "If account exists, reset link sent ✅"
      });
    }

    // 🔥 SECURE TOKEN
    const token = crypto.randomBytes(32).toString("hex");

    // 🔥 HASH TOKEN (DB me safe store)
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    user.resetToken = hashedToken;
    user.resetTokenExpiry = Date.now() + 15 * 60 * 1000;

    await user.save();

    // 🔗 RESET LINK
    const resetLink = `https://myfamily-tree-application.netlify.app/reset.html?token=${token}`;

    // 📧 SEND EMAIL
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset",
      html: `
        <h2>Password Reset</h2>
        <p>Click below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>Link valid for 15 minutes</p>
      `
    });

    res.json({
      success: true,
      message: "If account exists, reset link sent ✅"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
      if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password too short ❌" });
    }

    // 🔥 HASH TOKEN AGAIN
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired link ❌"
      });
    }

    // 🔒 PASSWORD HASH
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;

    await user.save();

    res.json({
      success: true,
      message: "Password reset successful ✅"
    });

  } catch (err) {
    console.error("Forgot Password Error:", err); // 👈 ADD THIS
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// FILE UPLOAD (OPTIONAL)
// ==========================


const upload = multer({
  dest: "temp/"
});

// ==========================
// ADD PERSON
// ==========================
app.post("/add", auth, upload.single("profilePic"), async (req, res) => {
  try {
    const { name, gender, fatherId, motherId, spouseId, birthDate, deathDate, birthPlace, relationType } = req.body;

    if (!name || !gender) {
      return res.status(400).json({ message: "Name & Gender required ❌" });
    }

  let profilePic = "";

  if (req.file) {
    const result = await cloudinary.uploader.upload(req.file.path);
    profilePic = result.secure_url;
  }

    const person = new Person({
      name,
      gender,

      // ✅ CHANGE HERE
      fatherId: fatherId || null,
      motherId: motherId || null,

      spouseId: spouseId || null,
      birthDate: birthDate || null,
      deathDate: deathDate || null,
      birthPlace: birthPlace || "",
      relationType: relationType || "",
      profilePic,
      userId: req.userId
    });

    await person.save();

    if (spouseId) {
      await Person.findByIdAndUpdate(spouseId, {
        spouseId: person._id
      });
    }

    res.json({ success: true, message: "Person Added ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================
// GET ALL (USER SAFE)
// ==========================
app.get("/all", auth, async (req, res) => {
  try {
    const data = await Person.find({ userId: req.userId });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================
// GET SINGLE PERSON
// ==========================
app.get("/person/:id", auth, async (req, res) => {
  try {
    const person = await Person.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!person) {
      return res.status(404).json({ message: "Not found ❌" });
    }

    res.json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// UPDATE PERSON
// ==========================
app.put("/update/:id", auth, upload.single("profilePic"), async (req, res) => {
  try {
    const { id } = req.params;

    const updateData = {
      name: req.body.name,
      gender: req.body.gender,

      // ✅ CHANGE HERE
      fatherId: req.body.fatherId || null,
      motherId: req.body.motherId || null,

      spouseId: req.body.spouseId || null,
      relationType: req.body.relationType || ""
    };

      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path);
        updateData.profilePic = result.secure_url;
      }

    const person = await Person.findOneAndUpdate(
      { _id: id, userId: req.userId },
      updateData,
      { returnDocument: "after" }
    );

    if (!person) {
      return res.status(404).json({ message: "Not found ❌" });
    }

    // spouse 2-way fix
    if (updateData.spouseId) {
      await Person.findByIdAndUpdate(updateData.spouseId, {
        spouseId: id
      });
    }

    res.json({
      success: true,
      message: "Person Updated ✅",
      data: person
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ==========================
// DELETE PERSON
// ==========================
// DELETE PERSON

app.delete("/delete/:id", auth, async (req, res) => {
  try {
    const personId = req.params.id;

    const person = await Person.findOne({
      _id: personId,
      userId: req.userId
    });
    if (!person) {
      return res.status(404).send("Not found");
    }

    // ==========================
    // 🔥 CHILD FIX (FATHER + MOTHER)
    // ==========================

    // 👉 father delete ho raha hai
    await Person.updateMany(
      { fatherId: personId },
      { $set: { fatherId: person.spouseId || null } }
    );

    // 👉 mother delete ho rahi hai
    await Person.updateMany(
      { motherId: personId },
      { $set: { motherId: person.spouseId || null } }
    );

    // ==========================
    // 🔥 SPOUSE FIX
    // ==========================
    if (person.spouseId) {
      await Person.findByIdAndUpdate(person.spouseId, {
        spouseId: null
      });
    }

    // ==========================
    // 🔥 DELETE PERSON
    // ==========================
    await Person.findByIdAndDelete(personId);

    res.json({ success: true, message: "Deleted successfully ✅" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// GLOBAL ERROR HANDLER
// ==========================
app.use((err, req, res, next) => {
  console.error("Global Error:", err);
  res.status(500).json({ error: "Something went wrong ❌" });
});

// ==========================
// SERVER START
// ==========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});