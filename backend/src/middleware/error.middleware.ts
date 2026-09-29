import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/**
 * Global Error Handling Middleware
 * Catches and formats all errors
 */
export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("Error:", error);
  
  // Zod Validation Error
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
  }
  
  // Mongoose Duplicate Key Error
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {}).join(", ");
    return res.status(409).json({
      success: false,
      message: `${field ? field.charAt(0).toUpperCase() + field.slice(1) : "Record"} already exists`,
    });
  }

  // Mongoose Validation Error
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: Object.values(error.errors || {}).map((err: any) => ({
        field: err.path,
        message: err.message,
      })),
    });
  }

  // Mongoose Cast Error (Invalid ID)
  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid ${error.path}: ${error.value}`,
    });
  }
  
  // Default error response
  return res.status(500).json({
    success: false,
    message: error.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });
}

/**
 * 404 Not Found Middleware
 * Catches requests to undefined routes
 */
export function notFoundHandler(req: Request, res: Response) {
  return res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
}
