export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Wrap an async express handler so rejected promises reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
