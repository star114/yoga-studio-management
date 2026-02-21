import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import type { Server } from 'http';
import authRoutes from './routes/auth';
import customerRoutes from './routes/customers';
import membershipRoutes from './routes/memberships';
import attendanceRoutes from './routes/attendances';
import classRoutes from './routes/classes';
import { errorHandler } from './middleware/errorHandler';
import { ensureAdminUser } from './bootstrap/admin';
import { startClassAutoCloseWorker } from './worker/classAutoCloseWorker';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(morgan('combined'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/attendances', attendanceRoutes);
app.use('/api/classes', classRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

const startServer = async () => {
  try {
    await ensureAdminUser();
    const stopWorker = startClassAutoCloseWorker();

    const server = app.listen(PORT, () => {
      console.log(`🧘 Yoga Studio Backend running on port ${PORT}`);
    });

    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      console.log(`⚠️ Received ${signal}. Starting graceful shutdown...`);

      stopWorker();

      const forceExitTimer = setTimeout(() => {
        console.error('❌ Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10_000);

      const httpServer = server as Server;
      httpServer.close((error?: Error) => {
        clearTimeout(forceExitTimer);
        if (error) {
          console.error('❌ Error while closing HTTP server:', error);
          process.exit(1);
        }
        console.log('✅ HTTP server closed. Exiting.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
