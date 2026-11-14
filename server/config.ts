export function readConfig(env: NodeJS.ProcessEnv) {
  let publicUrl: URL | undefined;
  if (env.PUBLIC_URL) {
    publicUrl = new URL(env.PUBLIC_URL);
    if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) {
      throw new Error('PUBLIC_URL must be an HTTP(S) URL without credentials, query, or fragment.');
    }
  }
  const raw = env.BASE_PATH || publicUrl?.pathname || '/';
  if (!raw.startsWith('/') || /[?#\\]/.test(raw) || raw.includes('//') || raw.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('BASE_PATH must be an absolute URL path without query, fragment, or dot segments.');
  }
  const basePath = new URL(raw, 'http://localhost').pathname.replace(/\/+$/, '');
  if (env.BASE_PATH && publicUrl && basePath !== publicUrl.pathname.replace(/\/+$/, '')) {
    throw new Error('BASE_PATH must match the path in PUBLIC_URL.');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return { basePath, port, host: env.HOST || '0.0.0.0', publicOrigin: publicUrl?.origin };
}
export type ServerConfig = ReturnType<typeof readConfig>;
