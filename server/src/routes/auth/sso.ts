import { Router } from 'express';
import * as oidc from 'openid-client';
import crypto from 'node:crypto';
import prisma from '../../database/prisma';
import { appURL, tokenHash } from '../../platform/mail/communication';
import { createSessionForUser } from '../auth';
const router = Router();
const configured = () =>
  !!process.env.OIDC_ISSUER && !!process.env.OIDC_CLIENT_ID && !!process.env.OIDC_CLIENT_SECRET;
let configuration: Promise<oidc.Configuration> | undefined;
function config() {
  if (!configured()) throw new Error('Company single sign-on is not configured');
  return (configuration ??= oidc
    .discovery(
      new URL(process.env.OIDC_ISSUER!),
      process.env.OIDC_CLIENT_ID!,
      process.env.OIDC_CLIENT_SECRET!,
    )
    .catch((error) => {
      configuration = undefined;
      throw error;
    }));
}
const cookieName = 'wissen-sso';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth/sso',
  maxAge: 10 * 60000,
};
function cookie(req: { headers: { cookie?: string } }) {
  return req.headers.cookie
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
router.get('/config', (_req, res) => res.json({ configured: configured() }));
router.get('/start', async (_req, res) => {
  try {
    const configuration = await config();
    const state = oidc.randomState(),
      nonce = oidc.randomNonce(),
      verifier = oidc.randomPKCECodeVerifier();
    await prisma.oIDCRequest.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await prisma.oIDCRequest.create({
      data: {
        stateHash: tokenHash(state),
        verifier,
        nonce,
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
    res.cookie(cookieName, state, cookieOptions);
    res.redirect(
      oidc
        .buildAuthorizationUrl(configuration, {
          redirect_uri: appURL('/api/auth/sso/callback'),
          scope: 'openid email profile',
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: 'S256',
          state,
          nonce,
        })
        .toString(),
    );
  } catch {
    res.status(503).json({
      error: 'Company single sign-on is unavailable. Contact your administrator.',
    });
  }
});
router.get('/callback', async (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state || cookie(req) !== state) throw new Error('Invalid browser state');
    const request = await prisma.oIDCRequest.findUnique({
      where: { stateHash: tokenHash(state) },
    });
    if (!request || request.expiresAt < new Date()) throw new Error('Expired SSO request');
    // Deletion is a single-use claim before redeeming the authorization code.
    if (
      !(
        await prisma.oIDCRequest.deleteMany({
          where: { stateHash: request.stateHash },
        })
      ).count
    )
      throw new Error('SSO request already used');
    const tokens = await oidc.authorizationCodeGrant(
      await config(),
      new URL(req.originalUrl, appURL('/')),
      {
        pkceCodeVerifier: request.verifier,
        expectedState: state,
        expectedNonce: request.nonce,
      },
    );
    const claims = tokens.claims();
    if (!claims || typeof claims.sub !== 'string') throw new Error('Identity missing');
    const issuer = String(claims.iss);
    let identity = await prisma.oIDCIdentity.findUnique({
      where: { issuer_subject: { issuer, subject: claims.sub } },
    });
    if (!identity) {
      if (claims.email_verified !== true || typeof claims.email !== 'string')
        throw new Error('Verified email required');
      const user = await prisma.user.findUnique({
        where: { email: claims.email.toLowerCase() },
      });
      if (!user || user.isGuest || user.role === 'candidate')
        throw new Error('A team administrator must first create your staff account');
      identity = await prisma.oIDCIdentity.create({
        data: { issuer, subject: claims.sub, userId: user.id },
      });
    }
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: identity.userId },
    });
    if (user.role === 'candidate' || user.isGuest) throw new Error('Staff access required');
    const ticket = crypto.randomBytes(32).toString('hex');
    await prisma.accountToken.create({
      data: {
        userId: user.id,
        purpose: 'sso',
        tokenHash: tokenHash(ticket),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    res.cookie(cookieName, ticket, { ...cookieOptions, maxAge: 60000 });
    res.redirect(appURL('/account/sso'));
  } catch {
    res.clearCookie(cookieName, cookieOptions);
    res.redirect(appURL('/account/sso?error=1'));
  }
});
router.post('/session', async (req, res, next) => {
  try {
    const raw = cookie(req);
    res.clearCookie(cookieName, cookieOptions);
    if (!raw)
      return res.status(401).json({
        error: 'Sign-on session expired. Start company sign-in again.',
      });
    const token = await prisma.accountToken.findUnique({
      where: { tokenHash: tokenHash(raw) },
    });
    if (!token || token.purpose !== 'sso' || token.expiresAt < new Date() || token.consumedAt)
      return res.status(401).json({ error: 'Sign-on session expired' });
    if (
      !(
        await prisma.accountToken.updateMany({
          where: { id: token.id, consumedAt: null },
          data: { consumedAt: new Date() },
        })
      ).count
    )
      return res.status(401).json({ error: 'Sign-on session already used' });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: token.userId },
    });
    if (user.role === 'candidate' || user.isGuest)
      return res.status(403).json({ error: 'Staff access required' });
    const session = await createSessionForUser(user.id, user.email, user.name, user.role);
    res.json(session);
  } catch (error) {
    next(error);
  }
});
export default router;
