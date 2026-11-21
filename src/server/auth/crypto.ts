import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function getKey(): Buffer {
  const secret = process.env.PII_ENCRYPTION_KEY || "default-secret-key-32bytes-for-dev!!";
  // Always derive a strictly 32-byte key
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns string format: "iv:authTag:ciphertext" (hex encoded)
 */
export function encryptPii(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

/**
 * Decrypt cipherText ("iv:authTag:ciphertext") using AES-256-GCM
 */
export function decryptPii(cipherText: string): string {
  try {
    const [ivHex, tagHex, encryptedHex] = cipherText.split(":");
    if (!ivHex || !tagHex || !encryptedHex) {
      // Return as is if not encrypted or malformed
      return cipherText;
    }

    const key = getKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // If decryption fails, fallback
    return cipherText;
  }
}

/**
 * Calculate Korean Man-age (만 나이) from YYYY-MM-DD
 */
export function calcKoreanAge(birthDateStr: string, asOfDate: Date = new Date()): number {
  const parts = birthDateStr.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return 0;
  }
  const [bYear, bMonth, bDay] = parts;
  const currentYear = asOfDate.getFullYear();
  const currentMonth = asOfDate.getMonth() + 1;
  const currentDay = asOfDate.getDate();

  let age = currentYear - bYear;
  if (currentMonth < bMonth || (currentMonth === bMonth && currentDay < bDay)) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Returns current date in KST (YYYY-MM-DD)
 */
export function getTodayKST(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().slice(0, 10);
}

/**
 * Returns first day of current month in KST (YYYY-MM-01)
 */
export function getEvaluatedMonthKST(): string {
  return `${getTodayKST().slice(0, 7)}-01`;
}
