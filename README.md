# ⚙️ FixMate Server – Backend API

<p align="center">
  RESTful backend API for the FixMate Smart Device & Home Appliance Repair Platform.
</p>

<p align="center">
  <a href="https://fixmate20.vercel.app">🌐 Live Application</a> •
  <a href="https://server-one-eta-23.vercel.app/api/health">🟢 API Health Check</a>
</p>

## 📌 Project Overview

FixMate Server is the backend application responsible for handling business logic, authentication, database operations, repair services, bookings, and online payments for the FixMate platform.

It provides RESTful APIs that connect the Next.js frontend with MongoDB and third-party services.

## 🌐 Live URLs

- **Frontend:** https://fixmate20.vercel.app
- **Backend API:** https://server-one-eta-23.vercel.app
- **Health Check:** https://server-one-eta-23.vercel.app/api/health

## 🔐 Admin Demo Credentials

- **Email:** YOUR_ADMIN_EMAIL
- **Password:** YOUR_DEMO_ADMIN_PASSWORD

> Replace these placeholders with the demo admin account credentials used for project evaluation. Never publish private production credentials.

## ✨ Key Features

- Secure authentication and JWT verification.
- Role-based authorization for customers, technicians, and admins.
- User management.
- Repair service management.
- Booking and repair request management.
- Stripe payment integration.
- ImgBB image upload integration.
- MongoDB database operations.
- Protected API endpoints.
- CORS configuration.
- Database indexing for improved query performance.

## 🧰 Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime environment |
| Express.js | Backend framework |
| TypeScript | Type-safe development |
| MongoDB | NoSQL database |
| Better Auth | Authentication integration |
| JWT | Token verification |
| Jose | JWT signing and verification |
| Stripe | Payment processing |
| ImgBB | Image hosting |
| dotenv | Environment configuration |

## 📦 NPM Packages

### Dependencies

- `express`
- `cors`
- `mongodb`
- `jose`
- `stripe`
- `dotenv`

### Development Dependencies

- `typescript`
- `tsx`
- `@types/node`
- `@types/express`
- `@types/cors`

## ⚙️ Installation & Setup

### 1. Clone the repository

```bash
git clone YOUR_FIXMATE_SERVER_GITHUB_URL
```

### 2. Navigate to the project

```bash
cd FixMate-Server
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the server root directory.

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string
DB_NAME=fixmate

JWT_SECRET=your_shared_jwt_secret
CLIENT_URL=http://localhost:3000

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

IMGBB_API_KEY=your_imgbb_api_key

ADMIN_EMAIL=your_admin_email
ADMIN_SEED_KEY=your_admin_seed_key
```

**Security Notes:**

- Never upload `.env` to GitHub.
- Keep MongoDB credentials private.
- Never expose Better Auth or JWT secrets.
- Keep Stripe secret and webhook keys secure.
- Keep ImgBB API credentials private.
- Use the same `JWT_SECRET` configured in the frontend.

### 5. Run the development server

```bash
npm run dev
```

The backend will run at:

http://localhost:5000

## 🏗️ Project Architecture

```text
FixMate-Server/
│
├── src/
│   ├── index.ts
│   ├── auth.ts
│   └── db.ts
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

*Directory structure may vary depending on the current implementation.*

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run development server |
| `npm run build` | Compile TypeScript |
| `npm start` | Start compiled server |

## 🗄️ Database

FixMate uses MongoDB to store application data.

Main collections include:

- `users` – User information and roles.
- `services` – Repair service details.
- `bookings` – Customer bookings and repair requests.
- `payments` – Payment and transaction records.

## 💳 Payment Integration

Stripe is integrated to support secure online payments.

The backend handles payment-related operations and transaction records.

## 🚀 Deployment

The backend API is deployed on Vercel.

**Production API:** https://server-one-eta-23.vercel.app

**Health Check:** https://server-one-eta-23.vercel.app/api/health

## 🔗 Related Repository

**Frontend:** FixMate Client

Live Application: https://fixmate20.vercel.app

## 👩‍💻 Developer

**Nawrin Tarannum**

- GitHub: https://github.com/nawrin30
- LinkedIn: https://www.linkedin.com/in/nawrin-tarannum/

---

<p align="center">
  Built with ❤️ to power the FixMate repair service platform.
</p>