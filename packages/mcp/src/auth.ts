/** HTTP bearer check. Fails closed: no configured token ⇒ deny all HTTP. */
export function checkBearer(header: string | undefined, token: string | undefined): boolean {
  if (!token) return false;
  return header === `Bearer ${token}`;
}
