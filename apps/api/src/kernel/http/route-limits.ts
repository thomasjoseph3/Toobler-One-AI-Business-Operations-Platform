import type { FastifyInstance } from 'fastify';

// How often one address may call the routes that anyone can reach, or that send email. These are on top of the app-wide
// limit. Over the limit the answer is 429 TOO_MANY_REQUESTS.

/** A limit: at most `max` calls from one address in `timeWindow`. */
export interface RouteLimit {
  max: number;
  timeWindow: string;
}

/** The limits, by name. */
export const ROUTE_LIMITS = {
  login: { max: 10, timeWindow: '1 minute' },
  signUp: { max: 10, timeWindow: '1 hour' },
  verifyEmail: { max: 20, timeWindow: '1 minute' },
  refresh: { max: 30, timeWindow: '1 minute' },
  resendEmail: { max: 3, timeWindow: '10 minutes' },
  forgotPassword: { max: 3, timeWindow: '10 minutes' },
  resetPassword: { max: 10, timeWindow: '1 minute' },
  acceptInvitation: { max: 10, timeWindow: '1 minute' },
  // Each resend sends an email to someone who is not a user yet
  resendInvitation: { max: 10, timeWindow: '10 minutes' },
  changePassword: { max: 5, timeWindow: '10 minutes' },
  // Each test of an AI key makes a real call to the AI company (and may cost a little)
  testAiKey: { max: 10, timeWindow: '1 minute' },
  // Each "Try it" on a conversation type makes a real call to an AI company (and may cost a little)
  tryConversationType: { max: 10, timeWindow: '1 minute' },
  // Each "Test the agent" message makes real calls to an AI company (and costs a little)
  testAgentChat: { max: 20, timeWindow: '1 minute' },
  // Each setup chat reply may make a real call to an AI company (and costs the business a little)
  setupChat: { max: 60, timeWindow: '1 hour' },
  // The bubble on a website asks for its look once per page view (and the browser's preflight asks first)
  widgetConfig: { max: 60, timeWindow: '1 minute' },
  // An open chat window asks for new messages every few seconds (so a person's reply shows up); many bubbles can sit behind one address
  widgetPoll: { max: 600, timeWindow: '1 minute' },
  // Each visitor message makes real calls to an AI company (and costs the business a little)
  // The files of the chat widget (small, kept by browsers, but still open to anyone)
  widgetFile: { max: 120, timeWindow: '1 minute' },
  // Closing the bubble ends and sorts a chat
  widgetEnd: { max: 10, timeWindow: '1 minute' },
  widgetMessage: { max: 20, timeWindow: '1 minute' },
  // Meta checks the webhook address once when it is set up
  whatsappVerify: { max: 30, timeWindow: '1 minute' },
  // Meta's servers deliver every customer's message (all businesses) from a few addresses, so this is generous; it only stops a flood
  whatsappDelivery: { max: 1200, timeWindow: '1 minute' },
  // Each check makes one real call to Meta
  whatsappCheck: { max: 10, timeWindow: '1 minute' },
  // Each check signs in to a mail server, and each approved draft sends a real email
  emailCheck: { max: 10, timeWindow: '1 minute' },
} as const satisfies Record<string, RouteLimit>;

/**
 * The bit to spread into a route's `config` to apply a named limit: `config: { access: 'public', ...routeLimit(app, 'login') }`.
 * When the app runs with relaxed limits (tests that create many people from one address) it adds nothing.
 */
export function routeLimit(app: FastifyInstance, name: keyof typeof ROUTE_LIMITS) {
  return app.kernel.strictRouteLimits ? { rateLimit: { ...ROUTE_LIMITS[name] } } : {};
}
