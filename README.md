# Lost But Found

A full-stack school lost and found web application built for FBLA 2025–2026.  
Built with **Node.js · Express · PostgreSQL · EJS** by Kushal Khatri — Old Mill Senior High School, Maryland.

---

## Features

### For Students
- **Cork Board Browse** — items float across an interactive cork board; click to pin with a push-pin animation and view full details
- **AI Item Classification** — upload or take a photo and let TensorFlow.js + MobileNet automatically suggest the item name and category
- **Camera Capture** — take a photo directly from your device camera and scan it with AI in one click
- **Submit Found Items** — report found items with image upload, category, description, and an interactive Leaflet map pin
- **Floor Selector** — specify which floor of the school the item was found on
- **Claim Items** — submit ownership claims with a description
- **Email Verification** — account registration requires a 6-digit email verification code via EmailJS
- **Bot Protection** — Cloudflare Turnstile on registration prevents automated signups
- **AI Chatbot** — floating chat assistant powered by Claude AI (Anthropic) for help navigating the platform
- **3D School Map** — interactive 3D floor plan of Old Mill High School on the homepage with item markers

### For Admins
- **Admin Dashboard** — review, approve, and manage all items and claims
- **Item Status Management** — update item status (active, claimed, returned, rejected)
- **Claim Resolution** — approve or deny claims with automatic item status cascade
- **Audit Log** — every action is logged with timestamp and IP address
- **Secure Admin Login** — separate JWT-based admin authentication

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Database | PostgreSQL (pg) |
| Templating | EJS |
| Auth | JSON Web Tokens (JWT), bcrypt |
| File Uploads | Multer |
| Maps | Leaflet.js (OpenStreetMap) |
| AI Classification | TensorFlow.js, MobileNet |
| AI Chatbot | Anthropic Claude API (claude-haiku) |
| Email | EmailJS |
| Bot Detection | Cloudflare Turnstile |
| Icons | Font Awesome 6, Lucide |
| HTTP Client | Axios |

---

## Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL 14+
- A free [EmailJS](https://emailjs.com) account
- A free [Cloudflare Turnstile](https://dash.cloudflare.com) site
- An [Anthropic API key](https://console.anthropic.com) (for the chatbot)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/lost-but-found.git
cd lost-but-found

# 2. Install dependencies
npm install

# 3. Create your .env file (see below)

# 4. Start the server
node server.js
```

Open `http://localhost:3000` in your browser.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=3000

# JWT
JWT_SECRET=your_long_random_secret_key_here

# Admin credentials
ADMIN_USERNAME=FBLA20252026
ADMIN_PASSWORD=FBLA20252026

# PostgreSQL — use DATABASE_URL for cloud, or individual vars for local
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/lostandfound

# Or use individual vars instead of DATABASE_URL:
# PGHOST=localhost
# PGPORT=5432
# PGDATABASE=lostandfound
# PGUSER=postgres
# PGPASSWORD=yourpassword

# Anthropic (AI chatbot)
ANTHROPIC_API_KEY=sk-ant-...

# Cloudflare Turnstile
CLOUDFLARE_TURNSTILE_SECRET=your_turnstile_secret_key
```

> Never commit your `.env` file. It is already listed in `.gitignore`.

---

## Project Structure

```
lost-but-found/
├── server.js              # Main Express server
├── package.json
├── .env                   # ← NOT in git
├── .gitignore
├── public/
│   ├── styles.css         # Global stylesheet
│   ├── images/            # Logos, favicon
│   └── uploads/           # User uploaded images (not in git)
└── views/
    ├── index.ejs          # Homepage with 3D school map
    ├── browse.ejs         # Cork board item browser
    ├── uploadItem.ejs     # Submit found item + AI scan + camera
    ├── claim.ejs          # Claim an item
    ├── register.ejs       # Registration + email verification
    ├── login.ejs          # User login
    ├── account.ejs        # User dashboard
    ├── admin.ejs          # Admin dashboard
    ├── admin-data.ejs     # Admin data management
    ├── admin-login.ejs    # Admin login
    ├── faq.ejs
    ├── contact.ejs
    └── terms-of-service.ejs
```

---

## Database Schema

The server automatically creates all tables on first run using `CREATE TABLE IF NOT EXISTS`.

| Table | Purpose |
|---|---|
| `items` | Found items with location, contact, image, GPS pin |
| `claims` | Ownership claims filed against items |
| `categories` | Item taxonomy (seeded automatically) |
| `users` | Registered user accounts |
| `audit_log` | Append-only action log |

---

## Default Admin Credentials

```
Username: FBLA20252026
Password: FBLA20252026
```

> Change these in your `.env` before deploying publicly.

---

## Mobile / Camera

The camera capture feature requires **HTTPS**. For local mobile testing use [ngrok](https://ngrok.com):

```bash
# In a second terminal while server is running
ngrok http 3000
```

Open the generated `https://` URL on your phone.

---

## License

Built for FBLA 2025–2026 competition. All rights reserved.  
© 2026 Kushal Khatri — Old Mill Senior High School
