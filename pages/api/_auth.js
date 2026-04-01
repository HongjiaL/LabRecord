/**
 * Shared auth utility for API routes.
 * Verifies the X-App-Password header against the APP_PASSWORD env var.
 *
 * Usage in API handlers:
 *   const authError = checkAppPassword(req);
 *   if (authError) return authError;
 *
 * Auth header format: X-App-Password: <password>
 */
export function checkAppPassword(req) {
  const expected = process.env.APP_PASSWORD;

  // No password configured = open access (for dev / migration period)
  if (!expected) {
    return null;
  }

  const provided = req.headers['x-app-password'];

  if (!provided) {
    return { status: 401, body: { error: 'Unauthorized: password required. Send X-App-Password header.' } };
  }

  if (provided !== expected) {
    return { status: 403, body: { error: 'Forbidden: incorrect password.' } };
  }

  return null;
}
