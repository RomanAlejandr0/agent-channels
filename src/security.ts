import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCb);
export const id = () => randomUUID();
export const secret = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(value: string) {
  const salt = secret();
  return (
    salt + ":" + ((await scrypt(value, salt, 64)) as Buffer).toString("hex")
  );
}
export async function passwordMatches(value: string, encoded: string) {
  const [salt, expected] = encoded.split(":");
  const actual = (await scrypt(value, salt, 64)) as Buffer;
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actual.length === expectedBytes.length &&
    timingSafeEqual(actual, expectedBytes)
  );
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const requireThat: (
  ok: unknown,
  status: number,
  message: string,
) => asserts ok = (ok, status, message) => {
  if (!ok) throw new AppError(status, message);
};
