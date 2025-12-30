// server.js - Enhanced LegalEase Server with Complete Contract System
import 'dotenv/config';
import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for contract content

const SECRET = process.env.JWT_SECRET || "supersecretkey";

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email configuration with enhanced settings
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2'
  },
  timeout: 30000,
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
  dnsTimeout: 30000
});

// Test email configuration on startup
async function testEmailConnection() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('⚠️  EMAIL_USER or EMAIL_PASS not configured in .env file');
    console.log('📧 Falling back to console testing mode');
    console.log('📧 Reset codes will be displayed in terminal');
    return false;
  }

  try {
    console.log('📧 Testing email connection...');
    console.log(`📧 Connecting to Gmail SMTP with user: ${process.env.EMAIL_USER}`);
    
    await transporter.verify();
    console.log('✅ Email connection successful!');
    console.log(`📧 Email service ready: ${process.env.EMAIL_USER}`);
    
    return true;
  } catch (error) {
    console.error('❌ Email connection failed:');
    console.error('Error:', error.message);
    console.log('\n📧 Troubleshooting steps:');
    console.log('1. Make sure EMAIL_USER and EMAIL_PASS are set in your .env file');
    console.log('2. EMAIL_USER should be your full Gmail address (e.g., user@gmail.com)');
    console.log('3. EMAIL_PASS should be your Gmail App Password (not regular password)');
    console.log('4. Enable 2-Factor Authentication on your Gmail account');
    console.log('5. Generate an App Password: https://support.google.com/accounts/answer/185833');
    console.log('6. Make sure "Less secure app access" is OFF (use App Password instead)');
    console.log('\n📧 Falling back to console testing mode for now');
    return false;
  }
}

// --- Database setup ---
let db;
try {
  db = await open({
    filename: "./legalease.db",
    driver: sqlite3.Database,
  });
  console.log("Database connected successfully");
} catch (error) {
  console.error("Database connection failed:", error);
  process.exit(1);
}

// Create tables
try {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      is_admin BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Enhanced contracts table with all fields needed
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      template_id TEXT,
      type TEXT,
      jurisdiction TEXT,
      partyA TEXT,
      partyB TEXT,
      startDate TEXT,
      endDate TEXT,
      terms TEXT,
      contract_data TEXT,
      generated_content TEXT,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Create contract templates table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT UNIQUE,
      name TEXT,
      description TEXT,
      category TEXT,
      fields TEXT,
      template_content TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create password reset tokens table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create admin user if doesn't exist
  const adminExists = await db.get("SELECT id FROM users WHERE email = ?", ["adminsid@gmail.com"]);
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash("Coffee@030903", 10);
    await db.run(
      "INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)",
      ["Admin User", "adminsid@gmail.com", hashedPassword, 1]
    );
    console.log("Admin user created: adminsid@gmail.com");
  }

  // Insert default contract templates
  await insertDefaultTemplates();

  console.log("Database tables initialized");
} catch (error) {
  console.error("Database initialization failed:", error);
  process.exit(1);
}

// Insert default contract templates
async function insertDefaultTemplates() {
  const templates = [
    {
      template_id: 'rental_agreement',
      name: 'Rental Agreement',
      description: 'Comprehensive rental agreement for residential properties with Indian legal compliance',
      category: 'Real Estate',
      fields: JSON.stringify([
        { id: 'date', label: 'Agreement Date', type: 'date', required: true },
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'text', required: true },
        { id: 'landlordName', label: 'Landlord Full Name', type: 'text', required: true },
        { id: 'landlordAge', label: 'Landlord Age', type: 'number', required: true },
        { id: 'landlordAddress', label: 'Landlord Address', type: 'textarea', required: true },
        { id: 'tenantName', label: 'Tenant Full Name', type: 'text', required: true },
        { id: 'tenantAge', label: 'Tenant Age', type: 'number', required: true },
        { id: 'tenantAddress', label: 'Tenant Address', type: 'textarea', required: true },
        { id: 'propertyAddress', label: 'Property Full Address', type: 'textarea', required: true },
        { id: 'leaseStartDate', label: 'Lease Start Date', type: 'date', required: true },
        { id: 'leaseTerm', label: 'Lease Term', type: 'select', options: ['11 months', '1 year', '2 years', '3 years'], required: true },
        { id: 'monthlyRent', label: 'Monthly Rent (₹)', type: 'number', required: true },
        { id: 'rentDueDate', label: 'Rent Due Date (Day of Month)', type: 'number', min: 1, max: 31, required: true },
        { id: 'securityDeposit', label: 'Security Deposit (₹)', type: 'number', required: true },
        { id: 'noticePeriod', label: 'Termination Notice Period', type: 'select', options: ['1 month', '2 months', '3 months'], required: true },
        { id: 'specialTerms', label: 'Special Terms & Conditions', type: 'textarea', required: false }
      ])
    },
    {
      template_id: 'employment_contract',
      name: 'Employment Contract',
      description: 'Standard employment agreement compliant with Indian labor laws',
      category: 'Employment',
      fields: JSON.stringify([
        { id: 'date', label: 'Agreement Date', type: 'date', required: true },
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'text', required: true },
        { id: 'companyName', label: 'Company Name', type: 'text', required: true },
        { id: 'companyAddress', label: 'Company Address', type: 'textarea', required: true },
        { id: 'employeeName', label: 'Employee Name', type: 'text', required: true },
        { id: 'employeeAge', label: 'Employee Age', type: 'number', required: true },
        { id: 'employeeAddress', label: 'Employee Address', type: 'textarea', required: true },
        { id: 'jobTitle', label: 'Job Title/Designation', type: 'text', required: true },
        { id: 'startDate', label: 'Employment Start Date', type: 'date', required: true },
        { id: 'basicSalary', label: 'Basic Salary (₹ per month/year)', type: 'number', required: true },
        { id: 'allowances', label: 'Allowances/Benefits (HRA, Medical, etc.)', type: 'textarea', required: false },
        { id: 'salaryDate', label: 'Salary Payment Date', type: 'text', placeholder: 'e.g., Last working day', required: true },
        { id: 'workingHours', label: 'Working Hours per Week', type: 'number', required: true },
        { id: 'probationPeriod', label: 'Probation Period (months)', type: 'number', required: true },
        { id: 'probationNotice', label: 'Notice Period During Probation', type: 'text', required: true },
        { id: 'regularNotice', label: 'Regular Notice Period', type: 'text', required: true },
        { id: 'specialTerms', label: 'Special Terms & Conditions', type: 'textarea', required: false }
      ])
    },
    {
      template_id: 'service_agreement',
      name: 'Service Agreement',
      description: 'Professional service agreement for contractors and service providers',
      category: 'Business',
      fields: JSON.stringify([
        { id: 'date', label: 'Agreement Date', type: 'date', required: true },
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'text', required: true },
        { id: 'clientName', label: 'Client Name/Company', type: 'text', required: true },
        { id: 'clientAddress', label: 'Client Address', type: 'textarea', required: true },
        { id: 'serviceProviderName', label: 'Service Provider Name', type: 'text', required: true },
        { id: 'serviceProviderAge', label: 'Service Provider Age', type: 'number', required: true },
        { id: 'serviceProviderAddress', label: 'Service Provider Address', type: 'textarea', required: true },
        { id: 'serviceDescription', label: 'Scope of Services', type: 'textarea', required: true },
        { id: 'startDate', label: 'Service Start Date', type: 'date', required: true },
        { id: 'endDate', label: 'Service End Date', type: 'date', required: true },
        { id: 'totalFee', label: 'Total Fee (₹)', type: 'number', required: true },
        { id: 'paymentSchedule', label: 'Payment Schedule', type: 'textarea', placeholder: 'e.g., 50% advance, 50% on completion', required: true },
        { id: 'paymentMode', label: 'Payment Mode', type: 'select', options: ['Bank Transfer', 'Cheque', 'UPI', 'Cash'], required: true },
        { id: 'noticePeriod', label: 'Termination Notice Period', type: 'text', required: true },
        { id: 'specialTerms', label: 'Special Terms & Conditions', type: 'textarea', required: false }
      ])
    },
    {
      template_id: 'sales_agreement',
      name: 'Sales Agreement',
      description: 'Comprehensive sales contract for goods and services',
      category: 'Sales',
      fields: JSON.stringify([
        { id: 'date', label: 'Agreement Date', type: 'date', required: true },
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'text', required: true },
        { id: 'sellerName', label: 'Seller Name', type: 'text', required: true },
        { id: 'sellerAddress', label: 'Seller Address', type: 'textarea', required: true },
        { id: 'buyerName', label: 'Buyer Name', type: 'text', required: true },
        { id: 'buyerAddress', label: 'Buyer Address', type: 'textarea', required: true },
        { id: 'itemDescription', label: 'Description of Goods/Services', type: 'textarea', required: true },
        { id: 'quantity', label: 'Quantity/Specifications', type: 'text', required: true },
        { id: 'totalPrice', label: 'Total Price (₹)', type: 'number', required: true },
        { id: 'taxInclusive', label: 'Tax Treatment', type: 'select', options: ['Inclusive of taxes', 'Exclusive of taxes'], required: true },
        { id: 'paymentTerms', label: 'Payment Terms', type: 'textarea', required: true },
        { id: 'paymentMode', label: 'Payment Mode', type: 'select', options: ['Bank Transfer', 'Cheque', 'UPI', 'Cash'], required: true },
        { id: 'deliveryDate', label: 'Delivery Date/Timeline', type: 'text', required: true },
        { id: 'deliveryLocation', label: 'Delivery Location', type: 'text', required: true },
        { id: 'inspectionPeriod', label: 'Inspection Period (days)', type: 'number', required: true },
        { id: 'warrantyPeriod', label: 'Warranty Period', type: 'text', required: true },
        { id: 'specialTerms', label: 'Special Terms & Conditions', type: 'textarea', required: false }
      ])
    },
    {
      template_id: 'nda',
      name: 'Non-Disclosure Agreement (NDA)',
      description: 'Confidentiality agreement to protect sensitive business information',
      category: 'Legal',
      fields: JSON.stringify([
        { id: 'date', label: 'Agreement Date', type: 'date', required: true },
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'text', required: true },
        { id: 'disclosingParty', label: 'Disclosing Party Name', type: 'text', required: true },
        { id: 'disclosingAddress', label: 'Disclosing Party Address', type: 'textarea', required: true },
        { id: 'receivingParty', label: 'Receiving Party Name', type: 'text', required: true },
        { id: 'receivingAddress', label: 'Receiving Party Address', type: 'textarea', required: true },
        { id: 'purpose', label: 'Purpose of Disclosure', type: 'textarea', placeholder: 'e.g., evaluation, collaboration, services', required: true },
        { id: 'confidentialityDuration', label: 'Confidentiality Duration', type: 'select', options: ['2 years', '3 years', '5 years', 'Indefinite'], required: true },
        { id: 'jurisdiction', label: 'Jurisdiction (City for Courts)', type: 'text', required: true },
        { id: 'specialTerms', label: 'Special Terms & Conditions', type: 'textarea', required: false }
      ])
    },
    {
      template_id: 'partnership_agreement',
      name: 'Partnership Agreement',
      description: 'Business partnership agreement with profit sharing and management terms',
      category: 'Business',
      fields: JSON.stringify([
        { id: 'date', label: 'Agreement Date', type: 'date', required: true },
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'text', required: true },
        { id: 'partner1Name', label: 'Partner 1 Name', type: 'text', required: true },
        { id: 'partner1Age', label: 'Partner 1 Age', type: 'number', required: true },
        { id: 'partner1Address', label: 'Partner 1 Address', type: 'textarea', required: true },
        { id: 'partner2Name', label: 'Partner 2 Name', type: 'text', required: true },
        { id: 'partner2Age', label: 'Partner 2 Age', type: 'number', required: true },
        { id: 'partner2Address', label: 'Partner 2 Address', type: 'textarea', required: true },
        { id: 'partnershipName', label: 'Partnership Name', type: 'text', required: true },
        { id: 'businessAddress', label: 'Principal Business Address', type: 'textarea', required: true },
        { id: 'businessPurpose', label: 'Purpose of Partnership', type: 'textarea', required: true },
        { id: 'partner1Capital', label: 'Partner 1 Capital Contribution (₹)', type: 'number', required: true },
        { id: 'partner2Capital', label: 'Partner 2 Capital Contribution (₹)', type: 'number', required: true },
        { id: 'partner1Profit', label: 'Partner 1 Profit Share (%)', type: 'number', max: 100, required: true },
        { id: 'partner2Profit', label: 'Partner 2 Profit Share (%)', type: 'number', max: 100, required: true },
        { id: 'managingPartner', label: 'Managing Partner(s)', type: 'text', required: true },
        { id: 'withdrawalNotice', label: 'Withdrawal Notice Period', type: 'text', required: true },
        { id: 'specialTerms', label: 'Special Terms & Conditions', type: 'textarea', required: false }
      ])
    }
  ];

  for (const template of templates) {
    const existing = await db.get("SELECT id FROM contract_templates WHERE template_id = ?", [template.template_id]);
    if (!existing) {
      await db.run(
        `INSERT INTO contract_templates (template_id, name, description, category, fields) 
         VALUES (?, ?, ?, ?, ?)`,
        [template.template_id, template.name, template.description, template.category, template.fields]
      );
    }
  }
  
  console.log("Contract templates initialized");
}

// --- Utility Functions ---

// Generate a random 6-digit code
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Global variable to track email service status
let emailServiceAvailable = false;

// Send email function with fallback
async function sendResetEmail(email, code) {
  // Always log to console for debugging
  console.log(`\n🔐 PASSWORD RESET REQUEST:`);
  console.log(`📧 Email: ${email}`);
  console.log(`🔢 Code: ${code}`);
  console.log(`⏰ Valid for 15 minutes\n`);

  // If email service is not available, only use console
  if (!emailServiceAvailable || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('📧 Email service not configured - code displayed above for testing');
    return true; // Return success for testing purposes
  }

  // Attempt to send actual email
  const mailOptions = {
    from: {
      name: 'LegalEase',
      address: process.env.EMAIL_USER
    },
    to: email,
    subject: 'LegalEase - Password Reset Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6366f1; margin: 0; font-size: 32px; font-weight: bold;">LegalEase</h1>
            <p style="color: #6b7280; margin: 5px 0; font-size: 16px;">Your AI Legal Assistant</p>
          </div>
          
          <div style="text-align: center; margin-bottom: 40px;">
            <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Password Reset Request</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
              We received a request to reset the password for your LegalEase account. 
              Use the verification code below to proceed with resetting your password:
            </p>
          </div>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
            <p style="color: white; margin: 0 0 10px 0; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Your Reset Code
            </p>
            <div style="background: rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 20px; margin: 15px 0;">
              <h1 style="color: white; font-size: 42px; font-weight: bold; letter-spacing: 8px; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                ${code}
              </h1>
            </div>
          </div>
          
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 30px 0;">
            <div style="display: flex; align-items: center;">
              <div style="color: #d97706; font-size: 20px; margin-right: 12px;">⚠️</div>
              <div>
                <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 600;">
                  Important Security Information
                </p>
                <p style="color: #92400e; margin: 5px 0 0 0; font-size: 14px;">
                  This code will expire in <strong>15 minutes</strong>. If you didn't request this reset, please ignore this email and ensure your account is secure.
                </p>
              </div>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              Need help? Contact our support team or visit our help center.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            © 2025 LegalEase. All rights reserved.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0;">
            This email was sent because a password reset was requested for your account.
          </p>
        </div>
      </div>
    `,
    text: `
      LegalEase - Password Reset Code
      
      We received a request to reset your password.
      
      Your reset code is: ${code}
      
      This code will expire in 15 minutes.
      
      If you didn't request this reset, please ignore this email.
      
      © 2025 LegalEase
    `
  };

  try {
    console.log(`📧 Sending email to: ${email}`);
    console.log(`📧 From: ${process.env.EMAIL_USER}`);
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log(`📧 Message ID: ${info.messageId}`);
    console.log(`📧 Response: ${info.response}`);
    
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    // Log additional debug info
    if (error.responseCode) {
      console.error('Response code:', error.responseCode);
    }
    if (error.response) {
      console.error('SMTP Response:', error.response);
    }
    
    console.log(`\n📧 Email failed, but code is available above for testing: ${code}\n`);
    
    // Return false to indicate email failed, but the reset process can still continue
    // since the code is logged to console
    return false;
  }
}

// Clean up expired tokens
async function cleanupExpiredTokens() {
  await db.run("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now')");
}

// --- Authentication Routes ---

app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await db.run(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashed]
    );
    res.json({ id: result.lastID, name, email });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(400).json({ error: "Email already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ 
      id: user.id, 
      email: user.email,
      isAdmin: user.is_admin 
    }, SECRET, {
      expiresIn: "24h",
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin,
        created_at: user.created_at,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// --- Password Reset Routes ---

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Check if user exists
    const user = await db.get("SELECT id FROM users WHERE email = ?", [email]);
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        success: true, 
        message: "If the email exists in our system, a reset code has been sent",
        emailSent: false 
      });
    }

    // Clean up old tokens for this email
    await db.run("DELETE FROM password_reset_tokens WHERE email = ?", [email]);

    // Generate reset code and token
    const resetCode = generateResetCode();
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store in database
    await db.run(
      "INSERT INTO password_reset_tokens (email, token, code, expires_at) VALUES (?, ?, ?, ?)",
      [email, resetToken, resetCode, expiresAt.toISOString()]
    );

    // Send email
    const emailSent = await sendResetEmail(email, resetCode);
    
    res.json({ 
      success: true, 
      message: emailSent 
        ? "Reset code sent to your email address" 
        : "Reset code generated (check console in development mode)",
      emailSent: emailSent
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

app.post("/api/verify-reset-code", async (req, res) => {
  const { email, code } = req.body;
  
  if (!email || !code) {
    return res.status(400).json({ error: "Email and code are required" });
  }

  try {
    // Clean up expired tokens first
    await cleanupExpiredTokens();

    // Find valid token
    const resetToken = await db.get(
      "SELECT * FROM password_reset_tokens WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')",
      [email, code]
    );

    if (!resetToken) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    // Return the token for the next step
    res.json({ 
      success: true, 
      token: resetToken.token,
      message: "Verification code confirmed successfully" 
    });

  } catch (err) {
    console.error("Verify code error:", err);
    res.status(500).json({ error: "Failed to verify code" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return res.status(400).json({ error: "Reset token and new password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  try {
    // Clean up expired tokens first
    await cleanupExpiredTokens();

    // Find valid token
    const resetToken = await db.get(
      "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')",
      [token]
    );

    if (!resetToken) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    await db.run(
      "UPDATE users SET password = ? WHERE email = ?",
      [hashedPassword, resetToken.email]
    );

    // Mark token as used
    await db.run(
      "UPDATE password_reset_tokens SET used = 1 WHERE token = ?",
      [token]
    );

    console.log(`Password reset successful for: ${resetToken.email}`);
    
    res.json({ success: true, message: "Password has been reset successfully" });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// --- Protected Routes ---

const requireAuth = async (req, res, next) => {
  try {
    const auth = req.headers["authorization"];
    if (!auth) return res.status(401).json({ error: "No token provided" });

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, SECRET);
    const user = await db.get("SELECT * FROM users WHERE id = ?", [decoded.id]);
    
    if (!user) return res.status(404).json({ error: "User not found" });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const user = await db.get(
      "SELECT id, name, email, is_admin, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    res.json(user);
  } catch (err) {
    console.error("Profile error:", err);
    res.status(401).json({ error: "Failed to fetch profile" });
  }
});

app.post("/api/change-password", requireAuth, async (req, res) => {
  try {
    const { oldPass, newPass } = req.body;
    if (!oldPass || !newPass)
      return res.status(400).json({ error: "Both old and new passwords are required" });

    const user = await db.get("SELECT * FROM users WHERE id = ?", [req.user.id]);
    const valid = await bcrypt.compare(oldPass, user.password);
    
    if (!valid) return res.status(400).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPass, 10);
    await db.run("UPDATE users SET password = ? WHERE id = ?", [hashed, req.user.id]);

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// --- Contract Template Routes ---

app.get("/api/contract-templates", async (req, res) => {
  try {
    const templates = await db.all(
      "SELECT template_id, name, description, category, fields FROM contract_templates WHERE is_active = 1"
    );
    
    // Parse the fields JSON for each template
    const parsedTemplates = templates.map(template => ({
      ...template,
      fields: JSON.parse(template.fields || '[]')
    }));
    
    res.json(parsedTemplates);
  } catch (err) {
    console.error("Fetch templates error:", err);
    res.status(500).json({ error: "Failed to fetch contract templates" });
  }
});

app.get("/api/contract-templates/:templateId", async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = await db.get(
      "SELECT * FROM contract_templates WHERE template_id = ? AND is_active = 1",
      [templateId]
    );
    
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    // Parse the fields JSON
    template.fields = JSON.parse(template.fields || '[]');
    
    res.json(template);
  } catch (err) {
    console.error("Fetch template error:", err);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

// --- Enhanced Contract Routes ---

app.post("/api/contracts", requireAuth, async (req, res) => {
  try {
    const { 
      template_id, 
      type, 
      jurisdiction, 
      partyA, 
      partyB, 
      startDate, 
      endDate, 
      terms, 
      contract_data,
      generated_content,
      status = 'draft'
    } = req.body;

    // Validate required fields
    if (!type || !partyA || !partyB) {
      return res.status(400).json({ error: "Missing required fields: type, partyA, partyB" });
    }

    const result = await db.run(
      `INSERT INTO contracts (
        user_id, template_id, type, jurisdiction, partyA, partyB, 
        startDate, endDate, terms, contract_data, generated_content, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, 
        template_id,
        type, 
        jurisdiction, 
        partyA, 
        partyB, 
        startDate, 
        endDate, 
        JSON.stringify(terms), 
        JSON.stringify(contract_data),
        generated_content,
        status
      ]
    );

    res.json({ 
      id: result.lastID, 
      success: true, 
      message: "Contract saved successfully" 
    });
    
    console.log(`Contract saved: ${type} for user ${req.user.email}`);
    
  } catch (err) {
    console.error("Save contract error:", err);
    res.status(500).json({ error: "Failed to save contract" });
  }
});

app.get("/api/contracts", requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0, status, type } = req.query;
    
    let query = `
      SELECT 
        id, template_id, type, jurisdiction, partyA, partyB, 
        startDate, endDate, status, created_at, updated_at
      FROM contracts 
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    // Add filters
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (type) {
      query += ' AND type LIKE ?';
      params.push(`%${type}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const contracts = await db.all(query, params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM contracts WHERE user_id = ?';
    const countParams = [req.user.id];
    
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    
    if (type) {
      countQuery += ' AND type LIKE ?';
      countParams.push(`%${type}%`);
    }
    
    const countResult = await db.get(countQuery, countParams);
    
    res.json({
      contracts,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error("Fetch contracts error:", err);
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

app.get("/api/contracts/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const contract = await db.get(
      "SELECT * FROM contracts WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );
    
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    
    // Parse JSON fields
    if (contract.terms) {
      contract.terms = JSON.parse(contract.terms);
    }
    if (contract.contract_data) {
      contract.contract_data = JSON.parse(contract.contract_data);
    }
    
    res.json(contract);
  } catch (err) {
    console.error("Fetch contract error:", err);
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

app.put("/api/contracts/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      type, 
      jurisdiction, 
      partyA, 
      partyB, 
      startDate, 
      endDate, 
      terms, 
      contract_data,
      generated_content,
      status 
    } = req.body;

    // Check if contract exists and belongs to user
    const existing = await db.get(
      "SELECT id FROM contracts WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );
    
    if (!existing) {
      return res.status(404).json({ error: "Contract not found" });
    }

    await db.run(
      `UPDATE contracts SET 
        type = ?, jurisdiction = ?, partyA = ?, partyB = ?, 
        startDate = ?, endDate = ?, terms = ?, contract_data = ?,
        generated_content = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
      [
        type, jurisdiction, partyA, partyB, startDate, endDate,
        JSON.stringify(terms), JSON.stringify(contract_data),
        generated_content, status, id, req.user.id
      ]
    );

    res.json({ success: true, message: "Contract updated successfully" });
    
  } catch (err) {
    console.error("Update contract error:", err);
    res.status(500).json({ error: "Failed to update contract" });
  }
});

app.delete("/api/contracts/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if contract exists and belongs to user
    const existing = await db.get(
      "SELECT id FROM contracts WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );
    
    if (!existing) {
      return res.status(404).json({ error: "Contract not found" });
    }

    await db.run("DELETE FROM contracts WHERE id = ? AND user_id = ?", [id, req.user.id]);
    
    res.json({ success: true, message: "Contract deleted successfully" });
    
  } catch (err) {
    console.error("Delete contract error:", err);
    res.status(500).json({ error: "Failed to delete contract" });
  }
});

// Contract Analytics endpoint
app.get("/api/contracts/analytics", requireAuth, async (req, res) => {
  try {
    const stats = await db.all(`
      SELECT 
        type,
        status,
        COUNT(*) as count,
        strftime('%Y-%m', created_at) as month
      FROM contracts 
      WHERE user_id = ? 
      GROUP BY type, status, month
      ORDER BY month DESC, type
    `, [req.user.id]);
    
    const totalContracts = await db.get(
      "SELECT COUNT(*) as total FROM contracts WHERE user_id = ?",
      [req.user.id]
    );

    res.json({
      totalContracts: totalContracts.total,
      stats
    });
  } catch (err) {
    console.error("Contract analytics error:", err);
    res.status(500).json({ error: "Failed to fetch contract analytics" });
  }
});

// --- Admin Routes ---

const requireAdmin = async (req, res, next) => {
  try {
    await requireAuth(req, res, () => {});
    if (!req.user.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
};

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;
    
    let query = "SELECT id, name, email, created_at FROM users WHERE is_admin = 0";
    const params = [];
    
    if (search) {
      query += " AND (name LIKE ? OR email LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));
    
    const users = await db.all(query, params);
    
    // Get user contract counts
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const contractCount = await db.get(
          "SELECT COUNT(*) as count FROM contracts WHERE user_id = ?",
          [user.id]
        );
        return {
          ...user,
          contractCount: contractCount.count
        };
      })
    );
    
    res.json(usersWithStats);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const totalUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE is_admin = 0");
    const totalContracts = await db.get("SELECT COUNT(*) as count FROM contracts");
    
    // Contract types distribution
    const contractTypes = await db.all(`
      SELECT type, COUNT(*) as count 
      FROM contracts 
      GROUP BY type 
      ORDER BY count DESC
    `);
    
    // Monthly growth
    const monthlyStats = await db.all(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as contracts,
        COUNT(DISTINCT user_id) as active_users
      FROM contracts 
      WHERE created_at >= date('now', '-12 months')
      GROUP BY month
      ORDER BY month DESC
    `);

    res.json({
      totalUsers: totalUsers.count,
      totalContracts: totalContracts.count,
      contractTypes,
      monthlyStats
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Admin contract management
app.get("/api/admin/contracts", requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, type, status } = req.query;
    
    let query = `
      SELECT 
        c.*, 
        u.name as user_name, 
        u.email as user_email
      FROM contracts c
      JOIN users u ON c.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      query += ' AND c.type LIKE ?';
      params.push(`%${type}%`);
    }
    
    if (status) {
      query += ' AND c.status = ?';
      params.push(status);
    }

    query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const contracts = await db.all(query, params);
    res.json(contracts);
  } catch (err) {
    console.error("Admin contracts error:", err);
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

// Admin template management
app.post("/api/admin/contract-templates", requireAdmin, async (req, res) => {
  try {
    const { template_id, name, description, category, fields, template_content } = req.body;
    
    if (!template_id || !name || !fields) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await db.run(
      `INSERT INTO contract_templates (template_id, name, description, category, fields, template_content)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [template_id, name, description, category, JSON.stringify(fields), template_content]
    );

    res.json({ success: true, message: "Template created successfully" });
  } catch (err) {
    console.error("Create template error:", err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

app.put("/api/admin/contract-templates/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, fields, template_content, is_active } = req.body;

    await db.run(
      `UPDATE contract_templates SET 
        name = ?, description = ?, category = ?, fields = ?, 
        template_content = ?, is_active = ?
      WHERE id = ?`,
      [name, description, category, JSON.stringify(fields), template_content, is_active, id]
    );

    res.json({ success: true, message: "Template updated successfully" });
  } catch (err) {
    console.error("Update template error:", err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// --- RAG Service Proxy Routes ---

app.post("/api/chat", async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      res.status(response.status).json(json);
    } catch {
      console.error("RAG service non-JSON:", text.slice(0, 200));
      res.status(502).json({ error: "Chat service returned invalid response" });
    }
  } catch (err) {
    console.error("Chat proxy error:", err);
    res.status(500).json({ error: "Chat service unavailable" });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const queryParams = new URLSearchParams(req.query);
    const response = await fetch(`http://localhost:8000/search?${queryParams}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      res.status(response.status).json(json);
    } catch {
      console.error("Search service non-JSON:", text.slice(0, 200));
      res.status(502).json({ error: "Search service returned invalid response" });
    }
  } catch (err) {
    console.error("Search proxy error:", err);
    res.status(500).json({ error: "Search service unavailable" });
  }
});

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, "..", "public")));

// Route handling
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/admin-dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin-dashboard.html"));
});

app.get("/contracts", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "contracts.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

// --- Error Handling ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// --- Cleanup Job ---
// Clean up expired tokens every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

// --- Start Server ---
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`\nLegalEase Server Started`);
  console.log(`Access your application: http://localhost:${PORT}`);
  
  console.log(`\nAdmin Login Credentials:`);
  console.log(`Email: adminsid@gmail.com`);
  console.log(`Password: Coffee@030903`);
  
  // Test email connection and set global status
  emailServiceAvailable = await testEmailConnection();
  
  if (emailServiceAvailable) {
    console.log(`\nEmail service is fully operational`);
    console.log(`Reset codes will be sent via email`);
  } else {
    console.log(`\nEmail service not configured or failed`);
    console.log(`Reset codes will be displayed in console for testing`);
    console.log(`\nTo enable email service:`);
    console.log(`1. Create a .env file in your project root`);
    console.log(`2. Add: EMAIL_USER=your-email@gmail.com`);
    console.log(`3. Add: EMAIL_PASS=your-gmail-app-password`);
    console.log(`4. Restart the server`);
  }
  
  console.log(`\nContract System Features:`);
  console.log(`6 contract templates (Rental, Employment, Service, Sales, NDA, Partnership)`);
  console.log(`Dynamic form generation`);
  console.log(`Contract preview and PDF export`);
  console.log(`Contract management and analytics`);
  console.log(`Admin template management`);
  
  console.log(`\nServer ready for requests!\n`);
});