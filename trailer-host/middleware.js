/*
 * Vercel Routing Middleware: only serve the relay to callers that know the shared secret.
 * The launcher appends ?k=<secret>; the secret lives in the RELAY_SECRET environment variable
 * on Vercel and in the launcher's gitignored js/config.local.js, never in the repository.
 * With RELAY_SECRET unset, everything is refused rather than left open.
 */
export const config = { matcher: '/(.*)' };

function same(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export default function middleware(request) {
    const secret = process.env.RELAY_SECRET;
    const given = new URL(request.url).searchParams.get('k');
    if (!secret || !same(given, secret)) {
        return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    // Returning nothing lets the request through to index.html.
}
