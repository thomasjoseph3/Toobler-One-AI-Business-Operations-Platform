import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  okResponseSchema,
  profileResponseSchema,
  resetPasswordRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  updateProfileRequestSchema,
  verifyEmailRequestSchema,
} from '@toobler-one/shared';
import { ApiError, unauthorized } from '../../../kernel/errors';
import type { Principal } from '../../../kernel/http/guard';
import { clearAuthCookies, readRefreshCookie, setAuthCookies } from './cookies';
import { createAuthService, type ClientInfo } from './service';

/** Who is making the request, for the session record and the activity log. */
const clientOf = (request: FastifyRequest): ClientInfo => ({
  userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
  ip: request.ip,
});

/** The signed-in person. The guard has already put it there on every `staff` route; this only satisfies the type checker. */
const principalOf = (request: FastifyRequest): Principal => {
  if (!request.principal) throw unauthorized();
  return request.principal;
};

/** Registers every sign-in route (docs/features/F01). Public ones are listed in kernel/http/public-routes.ts. */
export function authRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, mail } = app.kernel;
  const authService = createAuthService({ config, database, mail, logger: app.log });

  // Limits per address, multiplied by AUTH_RATE_LIMIT_SCALE (1 everywhere except in tests). The lockout after 5 wrong
  // passwords for one email is separate: it lives in the database (login_attempts) and cannot be dodged by changing address.
  const limit = (maxRequests: number, timeWindow: string) => ({
    max: Math.max(1, Math.round(maxRequests * config.auth.rateLimitScale)),
    timeWindow,
  });

  typedApp.post(
    '/auth/signup',
    {
      config: { access: 'public', rateLimit: limit(5, '1 hour') },
      schema: { body: signUpRequestSchema, response: { 201: profileResponseSchema } },
    },
    async (request, reply) => {
      const { tokens, profile } = await authService.signUp(request.body, clientOf(request));
      setAuthCookies(reply, config, tokens);
      return reply.code(201).send(profile);
    },
  );

  typedApp.post(
    '/auth/verify-email',
    {
      config: { access: 'public', rateLimit: limit(20, '15 minutes') },
      schema: { body: verifyEmailRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await authService.verifyEmail(request.body.token, clientOf(request));
      return { ok: true as const };
    },
  );

  typedApp.post(
    '/auth/resend-email',
    {
      config: { access: 'staff', allowUnverified: true, rateLimit: limit(3, '15 minutes') },
      schema: { response: { 200: okResponseSchema } },
    },
    async (request) => {
      await authService.resendVerificationEmail(principalOf(request));
      return { ok: true as const };
    },
  );

  typedApp.post(
    '/auth/login',
    {
      config: { access: 'public', rateLimit: limit(50, '15 minutes') },
      schema: { body: signInRequestSchema, response: { 200: profileResponseSchema } },
    },
    async (request, reply) => {
      const { tokens, profile } = await authService.signIn(
        request.body.email,
        request.body.password,
        clientOf(request),
      );
      setAuthCookies(reply, config, tokens);
      return profile;
    },
  );

  typedApp.post(
    '/auth/refresh',
    {
      config: { access: 'public', rateLimit: limit(60, '1 minute') },
      schema: { response: { 200: okResponseSchema } },
    },
    async (request, reply) => {
      const refreshToken = readRefreshCookie(request, config);
      try {
        if (!refreshToken) throw new ApiError(401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.');
        setAuthCookies(reply, config, await authService.refresh(refreshToken));
        return { ok: true as const };
      } catch (error) {
        clearAuthCookies(reply, config); // a refresh that failed leaves nothing worth keeping in the browser
        throw error;
      }
    },
  );

  typedApp.post(
    '/auth/logout',
    {
      config: { access: 'staff', allowUnverified: true },
      schema: { response: { 200: okResponseSchema } },
    },
    async (request, reply) => {
      await authService.signOut(principalOf(request), clientOf(request));
      clearAuthCookies(reply, config);
      return { ok: true as const };
    },
  );

  typedApp.post(
    '/auth/forgot-password',
    {
      config: { access: 'public', rateLimit: limit(5, '15 minutes') },
      schema: { body: forgotPasswordRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await authService.requestPasswordReset(request.body.email);
      return { ok: true as const }; // the same answer whether or not the email has an account
    },
  );

  typedApp.post(
    '/auth/reset-password',
    {
      config: { access: 'public', rateLimit: limit(10, '15 minutes') },
      schema: { body: resetPasswordRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await authService.resetPassword(request.body.token, request.body.password, clientOf(request));
      return { ok: true as const };
    },
  );

  typedApp.get(
    '/me',
    {
      config: { access: 'staff', allowUnverified: true },
      schema: { response: { 200: profileResponseSchema } },
    },
    async (request) => {
      if (!request.requestContext) throw unauthorized();
      return authService.getProfile(request.requestContext);
    },
  );

  typedApp.patch(
    '/me',
    {
      config: { access: 'staff' },
      schema: { body: updateProfileRequestSchema, response: { 200: profileResponseSchema } },
    },
    async (request) => {
      if (!request.requestContext) throw unauthorized();
      return authService.updateName(request.requestContext, request.body.name);
    },
  );

  typedApp.post(
    '/me/password',
    {
      config: { access: 'staff', rateLimit: limit(10, '15 minutes') },
      schema: { body: changePasswordRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await authService.changePassword(
        principalOf(request),
        request.body.currentPassword,
        request.body.newPassword,
        clientOf(request),
      );
      return { ok: true as const };
    },
  );
}
