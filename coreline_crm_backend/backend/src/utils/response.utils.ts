import { Response } from "express";

/**
 * Response Utility Functions
 * Standardized API response formats
 */

/**
 * Success Response
 * Sends standardized success response
 */
export function successResponse(
  res: Response,
  data: any,
  message: string = "Success",
  statusCode: number = 200
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Error Response
 * Sends standardized error response
 */
export function errorResponse(
  res: Response,
  message: string = "An error occurred",
  statusCode: number = 500,
  error?: any
) {
  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === "development" ? error : undefined,
  });
}

/**
 * Validation Error Response
 * Sends validation error response
 */
export function validationErrorResponse(
  res: Response,
  errors: any[]
) {
  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors,
  });
}

/**
 * Unauthorized Response
 * Sends 401 unauthorized response
 */
export function unauthorizedResponse(
  res: Response,
  message: string = "Unauthorized access"
) {
  return res.status(401).json({
    success: false,
    message,
  });
}

/**
 * Forbidden Response
 * Sends 403 forbidden response
 */
export function forbiddenResponse(
  res: Response,
  message: string = "Access forbidden"
) {
  return res.status(403).json({
    success: false,
    message,
  });
}

/**
 * Not Found Response
 * Sends 404 not found response
 */
export function notFoundResponse(
  res: Response,
  message: string = "Resource not found"
) {
  return res.status(404).json({
    success: false,
    message,
  });
}
