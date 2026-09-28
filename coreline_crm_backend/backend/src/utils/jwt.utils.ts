import jwt from "jsonwebtoken";

/**
 * JWT Utility Functions
 * Token generation and verification
 */

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-this";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * JWT Payload Interface
 */
export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Generate JWT Token
 * Creates a signed JWT token with user data
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verify JWT Token
 * Validates and decodes JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

/**
 * Decode JWT Token (without verification)
 * Used for debugging only
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}
