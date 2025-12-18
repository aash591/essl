# ESSL Dashboard

A modern Next.js-based dashboard for managing ESSL/ZKTeco biometric attendance devices. This application connects to devices directly via TCP/IP without requiring legacy Windows DLLs, making it cross-platform and deployable anywhere.

## 🚀 Key Features

- **No Legacy DLLs Required**: Uses pure JavaScript implementation via `zkteco-js` npm package
- **Cross-Platform**: Works on Windows, Linux, macOS, and Docker containers
- **Direct TCP/IP Connection**: Connects to devices over network using standard TCP sockets
- **Real-time Sync**: Automatic synchronization of users, attendance logs, and fingerprints
- **Modern Stack**: Built with Next.js 16, React 19, TypeScript, and Drizzle ORM

## 📡 How Device Connection Works (Without Legacy DLLs)

### Traditional Approach (Legacy)
- Used Windows-specific DLLs (like `zteckos.dll` or `zkemkeeper.dll`)
- Required Windows COM components
- Platform-dependent, difficult to deploy on Linux/servers
- Native dependencies that need compilation

### This Implementation (Modern)
This application uses **`zkteco-js`**, a pure JavaScript library that implements the ZKTeco communication protocol directly:

1. **TCP Socket Connection**: Creates a direct TCP connection to the device (default port: 4370)
2. **Protocol Implementation**: Implements the proprietary ZKTeco protocol using raw TCP packets
3. **Session Management**: Handles session IDs and authentication automatically
4. **Password Authentication**: Supports device COM passwords using cryptographic key generation
5. **Command Execution**: Sends and receives commands using the device's native protocol

### Connection Flow

```
Application → zkteco-js → TCP Socket → Biometric Device
                ↓
         Pure JavaScript
         (No Native DLLs)
```

### Technical Details

- **Protocol**: ZKTeco proprietary TCP/IP protocol
- **Port**: 4370 (default), configurable
- **Authentication**: Uses `makeCommKey()` function to generate authentication payloads from device passwords
- **Commands**: Raw command codes (e.g., `CMD_GET_TIME`, `CMD_AUTH`, `CMD_DB_RRQ`)
- **Data Format**: Binary protocol with little-endian encoding

## 🛠 Tech Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Recharts** - Data visualization

### Backend
- **Next.js API Routes** - Server-side endpoints
- **Node.js 22** - Runtime environment
- **zkteco-js** (v1.7.1) - Device communication library

### Database
- **PostgreSQL** - Primary database
- **Drizzle ORM** (v0.45.0) - Type-safe query builder
- **Supabase** - Optional PostgreSQL host (or any PostgreSQL instance)

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

## 📋 Prerequisites

- Node.js >= 20.9 (Next.js 16 requirement)
- PostgreSQL database (or Supabase instance)
- ESSL/ZKTeco biometric device on the same network
- Network access to device IP and port (default: 4370)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd essl-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   Edit `.env.local` with your configuration (see Environment Variables section below)

4. **Set up database**
   ```bash
   # Generate database migrations
   npm run db:generate
   
   # Run migrations
   npm run db:migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   Open [http://localhost:3000](http://localhost:3000)

## 🔐 Environment Variables

Create a `.env.local` file based on `env.example`. Here's what each variable does:

### Device Configuration
```env
# IP address of the biometric attendance device
NEXT_PUBLIC_DEVICE_IP=10.10.20.58

# Port number for device communication (default: 4370)
NEXT_PUBLIC_DEVICE_PORT=4370

# Serial number of the biometric device (optional)
NEXT_PUBLIC_DEVICE_SERIAL=DEVICE_SERIAL_NUMBER
```

### Database Configuration
```env
# Supabase Configuration (optional if using direct PostgreSQL)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Direct PostgreSQL Connection (recommended)
SUPABASE_DB_USE_DIRECT=true
SUPABASE_DB_HOST_POSTGRES_URL=localhost
SUPABASE_DB_PORT_POSTGRES_DIRECT=5433
SUPABASE_DB_USER_POSTGRES=postgres
SUPABASE_DB_PASSWORD=your_password
SUPABASE_DB_NAME_POSTGRES=postgres
```

### Application Configuration
```env
# Project environment
PROJECT_ENVIRONMENT=DEVELOPMENT

# Database schema names
DB_SCHEMA_NAME_PROD=production
DB_SCHEMA_NAME_DEV=development

# Auto-migration on startup (set to true to disable)
DISABLE_AUTO_MIGRATE=false
```

### Example `.env.local`
```env
# Device
NEXT_PUBLIC_DEVICE_IP=192.168.1.100
NEXT_PUBLIC_DEVICE_PORT=4370

# Database (Direct PostgreSQL)
SUPABASE_DB_USE_DIRECT=true
SUPABASE_DB_HOST_POSTGRES_URL=localhost
SUPABASE_DB_PORT_POSTGRES_DIRECT=5432
SUPABASE_DB_USER_POSTGRES=postgres
SUPABASE_DB_PASSWORD=mypassword
SUPABASE_DB_NAME_POSTGRES=essl_db

# Application
PROJECT_ENVIRONMENT=DEVELOPMENT
DB_SCHEMA_NAME_DEV=dev_schema
DISABLE_AUTO_MIGRATE=false
```

## 🐳 Docker Deployment

### Build the image
```bash
docker build -t essl-dashboard:latest .
```

### Run with Docker Compose
```bash
docker-compose up -d
```

The application will be available at `http://localhost:5000` (mapped from container port 3000).

Make sure your `.env.local` file is in the same directory as `docker-compose.yml`.

## 📚 API Endpoints

### Device Management
- `POST /api/device/connect` - Connect to a device
- `POST /api/device/info/fetch` - Get device information
- `POST /api/device/time/get` - Get device time
- `POST /api/device/time/set` - Set device time
- `POST /api/device/users` - Get/set users on device
- `POST /api/device/register` - Register user to device

### Synchronization
- `POST /api/sync` - Sync attendance logs
- `POST /api/sync/users` - Sync users
- `POST /api/sync/fingerprint` - Sync fingerprints
- `POST /api/sync/stream` - Real-time sync stream
- `POST /api/sync/stop` - Stop ongoing sync

### Database Operations
- `GET/POST /api/db/users` - User management
- `GET/POST /api/db/attendance` - Attendance records
- `GET/POST /api/db/fingerprint` - Fingerprint templates
- `GET/POST /api/db/stats` - Statistics

## 🔍 How It Works: Technical Deep Dive

### Connection Process

1. **Socket Creation**: Uses Node.js `net.Socket` to create TCP connection
2. **Protocol Handshake**: Implements ZKTeco's proprietary handshake
3. **Session ID**: Receives session ID from device for authenticated commands
4. **Password Auth** (if required): Generates auth key using `makeCommKey(password, sessionId)`
5. **Command Execution**: Sends binary commands following ZKTeco protocol format

### Example Connection Code
```typescript
import ZKLib from "zkteco-js";

const zkInstance = new ZKLib(deviceIP, 4370, timeout, 4000);
await zkInstance.createSocket(); // Creates TCP connection
```

### Authentication Flow
```typescript
// If device has COM password
const sessionId = zkInstance.ztcp.sessionId;
const authPayload = makeCommKey(parseInt(password), sessionId);
const authBuf = Buffer.alloc(4);
authBuf.writeUInt32LE(authPayload, 0);
await zkInstance.executeCmd(CMD_AUTH, authBuf);
```

### Data Retrieval
- **Users**: `zkInstance.getUsers()` - Returns user list from device
- **Attendance**: `zkInstance.getAttendances()` - Returns all attendance logs
- **Templates**: Custom command `CMD_DB_RRQ` with `EF_FINGER` parameter
- **Device Info**: `zkInstance.getInfo()` - Returns device status

## 🗄 Database Schema

The application uses Drizzle ORM with PostgreSQL. Key tables:

- `att_users` - User records
- `att_devices` - Device configurations
- `att_attendance` - Attendance logs
- `att_fingerprints` - Fingerprint templates
- `att_shifts` - Shift definitions
- `att_designations` - Designation/role definitions

See `src/lib/drizzle/schema/` for full schema definitions.

## 📝 Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Database
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio
```

## 🔒 Security Considerations

- Device passwords are stored in the database (encrypted at rest recommended)
- Device connections use TCP/IP over local network (ensure network security)
- API endpoints should be protected in production
- Database credentials should be kept secure (never commit `.env.local`)

## 🐛 Troubleshooting

### Connection Issues
- **"EHOSTUNREACH"**: Check device IP and network connectivity
- **"Authentication Failed"**: Verify device COM password in database
- **"Connection Timeout"**: Ensure firewall allows port 4370

### Database Issues
- Ensure PostgreSQL is running and accessible
- Check connection credentials in `.env.local`
- Verify schema exists (run migrations)

### Sync Issues
- Check device connection status
- Verify user data exists in database
- Review server logs for detailed error messages

## 📖 Additional Resources

- [zkteco-js Documentation](https://www.npmjs.com/package/zkteco-js)
- [ZKTeco Device Protocol](https://www.zkteco.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows TypeScript best practices
- New features include proper error handling
- Database migrations are backward compatible
- API endpoints follow existing patterns

## 📄 License

[Specify your license here]

## 👤 Author

Aash591

---

**Note**: This application replaces legacy Windows DLL dependencies with a pure JavaScript implementation, enabling cross-platform deployment and easier maintenance.

