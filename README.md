# Legalease-AI
LegalEase is an open-source AI assistant for Indian case law. Built with the Indian Kanoon API, FAISS, and Google Gemini, it helps users search, explore, and summarize court cases. The platform also supports secure login, profile management, contract drafting, and an AI-powered chatbot—all accessible through a clean, modern web dashboard.

⚖️ LegalEase – AI-Powered Legal Research Assistant

LegalEase is a full-stack AI-powered legal assistant designed for Indian case law research. It integrates: 🔎 Indian Kanoon API for fetching fresh case law. 📚 HuggingFace Dataset (santoshtyss/indian_courts_cases) for semantic retrieval. 🧠 Google Gemini + FAISS for Retrieval-Augmented Generation (RAG). 🔐 SQLite + JWT authentication for secure user management. 📄 Contract Generator for drafting legal agreements. 💬 Chatbot Interface for interactive legal research.

🚀 Features User Authentication Signup / Login / JWT-based session management Change password, profile management Case Law Research Semantic retrieval from pre-indexed dataset using FAISS Indian Kanoon API for fresh case updates AI-generated summaries of top cases with links to PDFs LegalEase AI Chatbot Query case law in plain English Get concise AI summaries + suggested next steps Contract Generator Create and store custom legal contracts Save contracts tied to logged-in user Modern Frontend (Vanilla JS) Dashboard with sidebar navigation Research tab, Chat tab, Contract tab Glassmorphism + gradient design

🛠️ Tech Stack

Frontend HTML, CSS, JavaScript Fetch API for backend communication

Backend Node.js + Express SQLite (via sqlite3 + sqlite) bcrypt + JWT for authentication API proxy to Python RAG service RAG Service Python + FastAPI HuggingFace Datasets (Indian Courts) FAISS Vector DB LangChain + Google Gemini API Indian Kanoon API integration LegalEase - AI Legal Assistant Platform A comprehensive legal assistant platform that provides AI-powered legal guidance, contract generation, and case research capabilities for the Indian legal system. Show Image 🌟 Features

AI Legal Chat: Get instant legal advice powered by Google Gemini AI Contract Generator: Create professional contracts with 6+ templates (Rental, Employment, Service, Sales, NDA, Partnership) Case Research: Search through Indian legal database and precedents User Management: Secure authentication with password reset functionality Admin Dashboard: Complete admin panel for user and contract management Document Export: Generate PDF contracts and save for future reference Real-time Search: Integration with Indian Kanoon API for live legal case data

🚀 Tech Stack Backend

Node.js with Express.js SQLite3 database with SQL.js JWT authentication bcrypt password hashing nodemailer for email services

Frontend

Vanilla JavaScript with modern ES6+ CSS3 with glassmorphism design Responsive design for all devices

AI & Search

Python FastAPI RAG service Google Gemini AI for legal guidance Indian Kanoon API integration FAISS for vector search (optional)

📋 Prerequisites Before running this application, make sure you have:

Node.js (v18 or higher) Python (v3.8 or higher) npm (v9 or higher) Git

🛠️ Installation & Setup

Clone the Repository bashgit clone https://github.com/yourusername/legalease.git cd legalease
Backend Setup bash# Install Node.js dependencies npm install
Or if you have a package-lock.json
npm ci 3. Python RAG Service Setup bash# Install Python dependencies pip install -r requirements.txt

Or using virtual environment (recommended)
python -m venv venv source venv/bin/activate # On Windows: venv\Scripts\activate pip install -r requirements.txt 4. Environment Configuration Create a .env file in the project root: env# JWT Configuration JWT_SECRET=your_super_secret_jwt_key_here

Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com EMAIL_PASS=your-gmail-app-password

Google AI Configuration
GOOGLE_API_KEY=your-google-gemini-api-key

Indian Kanoon API (Optional)
INDIAN_KANOON_API_KEY=your-indian-kanoon-api-key

Server Configuration
PORT=5000 NODE_ENV=development 5. Database Initialization The SQLite database will be automatically created when you first run the server. It includes:

Users table with admin account Contracts table for document storage Contract templates with pre-built forms Password reset tokens table

🚀 Running the Application Start the Backend Server bashnpm start

Or for development with auto-reload
npm run dev Start the RAG Service In a separate terminal: bashpython rag_service.py Or using uvicorn: bashuvicorn rag_service:app --host 0.0.0.0 --port 8000 --reload Access the Application

Main Application: http://localhost:5000 RAG Service API: http://localhost:8000 RAG Service Docs: http://localhost:8000/docs

👤 Default Admin Account Email: adminsid@gmail.com Password: Coffee@030903 📁 Project Structure legalease/ ├── server.js # Main Express server ├── rag_service.py # Python FastAPI service for AI ├── package.json # Node.js dependencies ├── requirements.txt # Python dependencies ├── legalease.db # SQLite database (auto-created) ├── .env # Environment variables ├── .gitignore # Git ignore rules ├── README.md # Project documentation │ ├── Frontend Files: ├── login.html # Login page ├── signup.html # Registration page
├── index.html # Main dashboard ├── contracts.html # Contract generator ├── research.html # Case research ├── chat.html # AI chat interface ├── profile.html # User profile ├── admin-dashboard.html # Admin panel ├── style.css # Main stylesheet └── script.js # Frontend JavaScript 🔧 API Endpoints Authentication

POST /api/signup - User registration POST /api/login - User login POST /api/forgot-password - Request password reset POST /api/verify-reset-code - Verify reset code POST /api/reset-password - Reset password

User Management

GET /api/profile - Get user profile POST /api/change-password - Change password

Contracts

GET /api/contract-templates - Get all templates GET /api/contracts - Get user contracts POST /api/contracts - Create new contract PUT /api/contracts/:id - Update contract DELETE /api/contracts/:id - Delete contract GET /api/contracts/analytics - Contract analytics

AI & Search

POST /api/chat - AI legal chat GET /api/search - Case research

Admin Routes

GET /api/admin/users - Manage users GET /api/admin/stats - Platform statistics GET /api/admin/contracts - All contracts

🎨 Contract Templates The platform includes 6 professional contract templates:

Rental Agreement - Comprehensive residential property rental Employment Contract - Standard employment with Indian labor law compliance Service Agreement - Professional service contracts Sales Agreement - Goods and services sales contracts Non-Disclosure Agreement (NDA) - Confidentiality agreements Partnership Agreement - Business partnership with profit sharing

🔐 Security Features

JWT-based authentication Bcrypt password hashing SQL injection protection CORS enabled Input validation and sanitization Secure password reset with email verification Admin role-based access control
