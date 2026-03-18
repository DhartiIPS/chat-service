export interface AuthUser {
  /** JWT subject — the user's unique ID (string). */
  sub: string;
  /** Roles assigned to this user (e.g. ['user'], ['admin']). */
  roles: string[];
  /** Any additional JWT claims forwarded by the auth service. */
  [key: string]: unknown;
}
