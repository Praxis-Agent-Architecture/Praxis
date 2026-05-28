export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function notFound(resource: string, id: string): AppError {
  return new AppError(404, 'NOT_FOUND', `${resource} not found`, { id });
}

export function conflict(resource: string, id: string): AppError {
  return new AppError(409, 'CONFLICT', `${resource} already exists`, { id });
}
