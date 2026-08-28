import { Router } from 'express';
import { validate } from '../../middleware/validate';
import * as authController from './auth.controller';
import { loginSchema, logoutSchema, signupSchema } from './auth.schema';

const router = Router();

/**
 * All three routes are unauthenticated by nature: the first two issue a session, and
 * logout revokes a refresh token that an expired access token must not be able to block.
 *
 * No rate limiter exists yet, so /login is brute-forceable. Known pre-production gap —
 * and with no account recovery, any limiter added later must throttle rather than lock
 * accounts out.
 */
router.post('/signup', validate({ body: signupSchema }), authController.signup);
router.post('/login', validate({ body: loginSchema }), authController.login);
router.post('/logout', validate({ body: logoutSchema }), authController.logout);

export default router;
