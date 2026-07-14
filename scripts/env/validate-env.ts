#!/usr/bin/env tsx
/**
 * Environment Variable Validation Script
 *
 * Required runtime config is intentionally small: Supabase for auth/storage,
 * an encryption secret for user AI keys, and either a workspace DeepSeek key
 * or user-provided keys saved through Settings.
 *
 * Usage:
 *   npm run validate-env
 *   or
 *   tsx scripts/env/validate-env.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0 && !process.env[key]) {
        process.env[key] = valueParts.join('=');
      }
    }
  });
} catch {
  // .env.local is optional in hosted environments.
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateRequiredEnvVars(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const required = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  for (const [key, value] of Object.entries(required)) {
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  const encryptionSecret =
    process.env.AI_SETTINGS_ENCRYPTION_KEY ??
    process.env.CSRF_SALT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!encryptionSecret || encryptionSecret.length < 16) {
    errors.push(
      'AI settings encryption requires AI_SETTINGS_ENCRYPTION_KEY, CSRF_SALT, or SUPABASE_SERVICE_ROLE_KEY with at least 16 characters.'
    );
  }

  const recommended = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    AI_PROVIDER: process.env.AI_PROVIDER ?? process.env.NEXT_PUBLIC_AI_PROVIDER,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  };

  for (const [key, value] of Object.entries(recommended)) {
    if (!value || value.trim() === '') {
      warnings.push(`Missing recommended environment variable: ${key}`);
    }
  }

  const preferredProvider =
    process.env.AI_PROVIDER ?? process.env.NEXT_PUBLIC_AI_PROVIDER ?? 'deepseek';
  if (preferredProvider !== 'deepseek') {
    warnings.push('DeepSeek is the intended low-cost provider for the core Concept Map flow.');
  }

  if (preferredProvider === 'deepseek' && !process.env.DEEPSEEK_API_KEY?.trim()) {
    warnings.push(
      'No workspace DEEPSEEK_API_KEY is configured. Users must save their own DeepSeek key in Settings before analysis.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function main() {
  console.log('Validating environment configuration...\n');
  const result = validateRequiredEnvVars();

  if (result.errors.length > 0) {
    console.log('\nValidation failed:\n');
    result.errors.forEach((error) => console.log(`  - ${error}`));
  } else {
    console.log('\nAll required environment variables are configured.');
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:\n');
    result.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  if (result.valid) {
    console.log('\nEnvironment summary:');
    console.log(`  - Node environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  - AI provider: ${process.env.AI_PROVIDER ?? process.env.NEXT_PUBLIC_AI_PROVIDER ?? 'deepseek'}`);
    console.log(`  - Supabase project: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] || 'unknown'}`);
  }

  if (!result.valid) {
    process.exit(1);
  }

  console.log('\nEnvironment validation passed.\n');
}

main();
