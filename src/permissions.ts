export interface HostPermissionPort {
  contains(pattern: string): Promise<boolean>;
  request(pattern: string): Promise<boolean>;
  remove(pattern: string): Promise<boolean>;
}

export function toHostPattern(origin: string): string {
  const url = new URL(origin);
  return url.protocol + '//' + url.host + '/*';
}

export async function ensureHostPermission(
  port: HostPermissionPort,
  origin: string,
): Promise<boolean> {
  const pattern = toHostPattern(origin);
  return await port.contains(pattern) || port.request(pattern);
}

export async function removeHostPermission(
  port: HostPermissionPort,
  origin: string,
): Promise<boolean> {
  return port.remove(toHostPattern(origin));
}
