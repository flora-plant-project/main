import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { ok } from './lib/apiResponse';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import gardenRoutes from './modules/garden/garden.routes';
import plantsRoutes from './modules/plants/plants.routes';
import diagnosisRoutes from './modules/diagnosis/diagnosis.routes';
import growthLogRoutes from './modules/growthLog/growthLog.routes';
import wateringScheduleRoutes from './modules/wateringSchedule/wateringSchedule.routes';
import communityRoutes from './modules/community/community.routes';

const app = express();

// Behind an ALB: trust the proxy so req.ip and req.protocol reflect the client,
// not the load balancer.
app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet());

/**
 * Auth uses Bearer tokens, not cookies, so no credentialed CORS and a wildcard origin
 * is safe when configured. Deployed environments should still list real origins.
 */
const allowAnyOrigin = env.corsOrigins.includes('*');
app.use(
  cors({
    origin: allowAnyOrigin ? '*' : env.corsOrigins,
    credentials: false,
  }),
);

// Cap payloads: images go to S3 via pre-signed URLs, so no request body needs to be large.
app.use(express.json({ limit: '1mb' }));

/**
 * Liveness only — deliberately does not touch Postgres, so a database blip cannot make
 * the load balancer cycle otherwise-healthy tasks. A readiness probe that checks the DB
 * is a separate endpoint if we decide we want one.
 */
app.get('/health', (_req, res) => {
  res.json(ok({ status: 'ok', env: env.NODE_ENV, uptime: process.uptime() }));
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/spaces', gardenRoutes);
app.use('/api/v1/plants', plantsRoutes);
app.use('/api/v1/diagnosis', diagnosisRoutes);
app.use('/api/v1/growth-logs', growthLogRoutes);
app.use('/api/v1/watering-schedules', wateringScheduleRoutes);
app.use('/api/v1/community', communityRoutes);

// ---------------------------------------------------------------------------
// Remaining feature routers mount here as each module lands:
//   app.use('/api/v1/community', communityRoutes);
//   app.use('/api/v1/admin', adminRoutes);
// ---------------------------------------------------------------------------

// Must stay last, and in this order.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
