# Printadel CRM & Production Management System

Comprehensive CRM, Attendance, Payroll, and Production Management System tailored for Printadel printing & packaging operations.

## Architecture

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Lucide icons, TanStack React Query, Socket.io Client.
- **Backend**: Node.js, Express, TypeScript, Mongoose (MongoDB), Socket.io, Nodemailer.
- **Database**: MongoDB

---

## Project Structure

```
printadel-crm/
├── coreline-crm-frontend/     # Next.js Frontend Application
│   ├── app/                   # App Router pages (Dashboard, Attendance, Payroll, Job Cards, etc.)
│   ├── components/            # Reusable UI components
│   └── lib/                   # API and Socket client configurations
├── coreline_crm_backend/      # Express TypeScript Backend
│   └── backend/
│       ├── src/
│       │   ├── controllers/   # Route controllers
│       │   ├── models/        # Mongoose database models
│       │   ├── routes/        # Express API routes
│       │   └── scripts/       # Database seeding & migration scripts
│       └── uploads/           # Uploaded files and media
└── assets/                    # Shared assets and stamps
```

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [MongoDB](https://www.mongodb.com/) (Running locally or MongoDB Atlas)

### 2. Backend Setup
```bash
cd coreline_crm_backend/backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URL and secrets
npm run dev
```

### 3. Frontend Setup
```bash
cd coreline-crm-frontend
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL to your backend URL (e.g. http://localhost:5001)
npm run dev
```

### 4. Seed Database (Optional)
To initialize default admin, manager, job cards, and payroll test data:
```bash
cd coreline_crm_backend/backend
npm run seed
```
Default accounts:
- **Admin**: `admin@printadel.com` / `123456`
- **Manager**: `manager@printadel.com` / `123456`
- **Employee**: `amit@printadel.com` / `123456`
