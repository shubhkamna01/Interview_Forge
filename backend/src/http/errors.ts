export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = "Please sign in again.") => new HttpError(401, m);
export const forbidden = (m = "You don't have access to this.") => new HttpError(403, m);
export const notFound = (m = "Not found.") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
