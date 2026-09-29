import User from "../models/User";
import { hashPassword, comparePassword } from "../utils/password.utils";
import { generateToken, JWTPayload } from "../utils/jwt.utils";

/**
 * Authentication Service
 * Handles user authentication logic
 */

/**
 * Login User
 * Authenticates user and returns JWT token
 */
export async function loginUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    console.warn(`Login failed: no user for ${normalizedEmail}`);
    throw new Error("Invalid email or password");
  }
  
  // Check if user is active
  if (!user.isActive) {
    throw new Error("Account is deactivated");
  }
  
  // Verify password
  const isPasswordValid = await comparePassword(password, user.password);
  
  if (!isPasswordValid) {
    console.warn(`Login failed: wrong password for ${normalizedEmail}`);
    throw new Error("Invalid email or password");
  }
  
  // Generate JWT token
  const tokenPayload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  
  const token = generateToken(tokenPayload);
  
  // Return user data (without password)
  const userObject = user.toObject();
  const { password: _, ...userWithoutPassword } = userObject;
  
  return {
    user: userWithoutPassword,
    token,
  };
}

/**
 * Get User Profile
 * Returns user profile by ID
 */
export async function getUserProfile(userId: string) {
  const user = await User.findById(userId).select(
    "id email fullName role employeeId designation department phone address joinDate managerId isActive createdAt updatedAt"
  );
  
  if (!user) {
    throw new Error("User not found");
  }
  
  return user;
}

/**
 * Change Password
 * Updates user password
 */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
) {
  // Get user with password
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error("User not found");
  }
  
  // Verify old password
  const isOldPasswordValid = await comparePassword(oldPassword, user.password);
  
  if (!isOldPasswordValid) {
    throw new Error("Current password is incorrect");
  }
  
  // Hash new password
  const hashedPassword = await hashPassword(newPassword);
  
  // Update password
  await User.findByIdAndUpdate(userId, { password: hashedPassword });
  
  return true;
}
