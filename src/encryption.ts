import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
export class MessageCipher {
  constructor(private key: Buffer) {
    if (key.length !== 32)
      throw new Error(
        "ENCRYPTION_KEY must contain 32 bytes encoded as base64.",
      );
  }
  static async load(dir: string, hasMessages = false) {
    if (process.env.ENCRYPTION_KEY)
      return new MessageCipher(
        Buffer.from(process.env.ENCRYPTION_KEY, "base64"),
      );
    if (dir === "memory://") return new MessageCipher(randomBytes(32));
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, "message-key");
    let key: Buffer;
    try {
      key = await readFile(path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      if (hasMessages)
        throw new Error(
          "Falta la clave de mensajes de una base existente. Restaura la clave original.",
        );
      key = randomBytes(32);
      try {
        await writeFile(path, key, { mode: 0o600, flag: "wx" });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        key = await readFile(path);
      }
    }
    await chmod(path, 0o600);
    return new MessageCipher(key);
  }
  encrypt(text: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      ciphertext.toString("base64"),
    ].join(".");
  }
  decrypt(text: string) {
    const [v, iv, tag, payload] = text.split(".");
    if (v !== "v1") throw new Error("Unsupported encrypted message.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
