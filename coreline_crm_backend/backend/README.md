# CRM Backend API

Backend API for Company CRM System built with Node.js, Express, TypeScript, Prisma, and PostgreSQL.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 15+
- npm or yarn

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
# Copy .env file and update with your values
cp .env .env.local  # Then edit .env with your config
```

3. **Configure Database:**
Update `DATABASE_URL` in `.env` file:
```
DATABASE_URL="postgresql://username:password@localhost:5432/crm_db?schema=public"
```

4. **Run database migrations:**
```bash
npm run prisma:migrate
```

5. **Seed database with demo data:**
```bash
npm run prisma:seed
```

6. **Generate Prisma Client:**
```bash
npm run prisma:generate
```

### Development

**Start development server:**
```bash
npm run dev
```

Server will run on `http://localhost:5000`

**Other commands:**
```bash
npm run build          # Build for production
npm start              # Run production build
npm run prisma:studio  # Open Prisma Studio (database GUI)
```

## 📝 Demo Credentials

After running the seed script:

- **Admin:** `admin@company.com` / `admin123`
- **Manager:** `manager@company.com` / `manager123`
- **Employee:** `employee@company.com` / `employee123`

## 📁 Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── migrations/        # Database migrations
│   └── seed.ts           # Seed data
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript types
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── uploads/             # File uploads directory
├── .env                 # Environment variables
└── package.json
```

## 🔧 Environment Variables

```bash
# Server
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/crm_db"

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@company.com

# CORS
CORS_ORIGIN=http://localhost:3000
```

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/profile` - Get current user profile
- `POST /api/auth/change-password` - Change password

### Health Check
- `GET /api/health` - API health check

## 🗄️ Database

### Schema Overview
- **Users** - Employee accounts and authentication
- **Attendance** - Punch in/out records
- **Leave** - Leave applications and approvals
- **LeaveBalance** - Annual leave quotas
- **Projects** - Project management
- **Milestones** - Project milestones
- **Tasks** - Task assignments and tracking
- **TaskTimers** - Time tracking for tasks
- **Payroll** - Salary calculations
- **Notifications** - In-app notifications

### Migrations

**Create new migration:**
```bash
npm run prisma:migrate
```

**Reset database:**
```bash
npx prisma migrate reset
```

## 🔐 Security

- JWT authentication with secure tokens
- Password hashing with bcrypt (10 rounds)
- CORS protection
- Input validation with Zod
- SQL injection protection (Prisma ORM)
- Role-based access control (RBAC)

## 🐛 Troubleshooting

### Database connection failed
- Ensure PostgreSQL is running
- Verify DATABASE_URL in .env
- Check PostgreSQL credentials

### Prisma Client errors
```bash
npm run prisma:generate
```

### Port already in use
Change PORT in .env or kill existing process:
```bash
lsof -ti:5000 | xargs kill
```

## 📦 Dependencies

### Production
- express - Web framework
- prisma/client - Database ORM
- bcryptjs - Password hashing
- jsonwebtoken - JWT authentication
- nodemailer - Email sending
- zod - Schema validation
- cors - CORS middleware

### Development
- typescript - TypeScript support
- ts-node-dev - Development server
- prisma - Prisma CLI

## 🚀 Deployment

### Build for production:
```bash
npm run build
```

### Run production server:
```bash
npm start
```

### Deployment Checklist:
- [ ] Update DATABASE_URL for production database
- [ ] Set strong JWT_SECRET
- [ ] Configure email provider
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS
- [ ] Set up database backups
- [ ] Configure monitoring/logging

## 📄 License

[License Type]

## 👥 Support

For issues and questions, please contact the development team.
