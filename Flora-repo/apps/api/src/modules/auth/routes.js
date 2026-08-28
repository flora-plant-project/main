import { Router } from 'express';
import { send } from '../../lib/respond.js';

/**
 * Auth routes. Thin by design — everything decidable lives in service.js.
 * @param {{service: ReturnType<import('./service.js').createAuthService>}} deps
 */
export function createAuthRoutes({ service }) {
  const router = Router();

  // 201: a signup creates a user. Login does not, so it stays 200.
  router.post('/signup', async (req, res) => {
    send(res, await service.signup(req.body), 201);
  });

  router.post('/login', async (req, res) => {
    send(res, await service.login(req.body));
  });

  router.post('/logout', async (req, res) => {
    send(res, await service.logout(req.token));
  });

  router.get('/me', async (req, res) => {
    send(res, await service.me(req.user));
  });

  return router;
}
