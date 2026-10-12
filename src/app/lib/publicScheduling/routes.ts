export function isPublicSchedulingPath(pathname: string) {
  return /^\/book(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?\/?$/.test(pathname);
}
