#!/usr/bin/env node
/**
 * Authenticated upload test using Playwright.
 * Tests with various file sizes to find the failure threshold.
 */

import { chromium } from "playwright";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = "https://everything.test";
const EMAIL = "clint@broadhead.me";
const PASSWORD = "testing123";

function createTestPng(sizeBytes) {
  // Create a valid-ish PNG of the desired size
  // PNG header + IHDR + padding IDAT + IEND
  const buf = Buffer.alloc(sizeBytes);
  // PNG signature
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  return buf;
}

async function run() {
  console.log("--- Authenticated Upload Test (size sweep) ---\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`  [browser error] ${msg.text()}`);
    }
  });

  page.on("requestfailed", (req) => {
    console.log(`  [REQUEST FAILED] ${req.method()} ${req.url().slice(0, 120)}`);
    console.log(`    error: ${req.failure()?.errorText}`);
  });

  page.on("response", (resp) => {
    if (resp.url().includes("storage")) {
      console.log(`  [RESPONSE] ${resp.request().method()} ${resp.url().slice(0, 100)} → ${resp.status()}`);
    }
  });

  // Login
  console.log("Logging in...");
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  console.log("Logged in!\n");

  // Test uploads of increasing sizes
  const sizes = [
    { label: "1KB", bytes: 1024 },
    { label: "50KB", bytes: 50 * 1024 },
    { label: "200KB", bytes: 200 * 1024 },
    { label: "500KB", bytes: 500 * 1024 },
    { label: "1MB", bytes: 1024 * 1024 },
  ];

  for (const { label, bytes } of sizes) {
    console.log(`--- Testing ${label} upload ---`);

    await page.goto(`${BASE}/listings/new`, { waitUntil: "networkidle" });

    const tmpFile = join(tmpdir(), `test-${label}.png`);
    writeFileSync(tmpFile, createTestPng(bytes));

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    try {
      await page.waitForSelector('[aria-label="Uploaded photos"] li', { timeout: 15000 });
      console.log(`  ✓ ${label} upload SUCCEEDED\n`);
    } catch {
      // Check for error on page
      const errorText = await page.locator('[class*="destructive"], [class*="error"]').allTextContents().catch(() => []);
      console.log(`  ✗ ${label} upload FAILED`);
      if (errorText.length) console.log(`  Error text: ${errorText.join(", ")}`);
      console.log();
    }

    try { unlinkSync(tmpFile); } catch {}
  }

  await browser.close();
  console.log("--- Done ---");
}

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
