#!/usr/bin/env node
/**
 * Admin Script: Add Credits to Users
 *
 * Adds topup credits without modifying subscription status.
 *
 * Usage:
 *   npx tsx scripts/ops/add-credits.ts <email> <credits> [options]
 *
 * Options:
 *   --dry-run           Show what would happen without making changes
 *   --help              Show this help message
 *
 * Examples:
 *   npx tsx scripts/ops/add-credits.ts user@example.com 10
 *   npx tsx scripts/ops/add-credits.ts user@example.com 50 --dry-run
 */

// Load .env.local file manually (required for standalone script execution)
import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
} catch {
  console.error('⚠️  Warning: Could not load .env.local file');
  console.error('   Make sure .env.local exists in the project root or environment variables are set via system\n');
}

// Import dependencies after environment is loaded
import { createServiceRoleClient } from '../lib/supabase/admin';

interface AddCreditsOptions {
  email: string;
  credits: number;
  dryRun?: boolean;
}

interface Profile {
  id: string;
  email: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  topup_credits: number;
}

function parseArgs(): AddCreditsOptions | null {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    showHelp();
    return null;
  }

  const email = args[0];
  if (!email || email.startsWith('--')) {
    console.error('❌ Error: Email address is required as first argument\n');
    showHelp();
    return null;
  }

  const creditsStr = args[1];
  if (!creditsStr || creditsStr.startsWith('--')) {
    console.error('❌ Error: Number of credits is required as second argument\n');
    showHelp();
    return null;
  }

  const credits = parseInt(creditsStr, 10);
  if (isNaN(credits) || credits <= 0) {
    console.error('❌ Error: Credits must be a positive number\n');
    showHelp();
    return null;
  }

  const options: AddCreditsOptions = { email, credits };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else {
      console.error(`❌ Error: Unknown option: ${arg}\n`);
      showHelp();
      return null;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Admin Script: Add Credits to Users

Adds topup credits without modifying subscription status.

Usage:
  npx tsx scripts/ops/add-credits.ts <email> <credits> [options]

Arguments:
  <email>             User's email address
  <credits>           Number of credits to add (must be positive)

Options:
  --dry-run           Show what would happen without making changes
  --help              Show this help message

Examples:
  # Add 10 credits to a user
  npx tsx scripts/ops/add-credits.ts user@example.com 10

  # Preview adding 50 credits (dry run)
  npx tsx scripts/ops/add-credits.ts user@example.com 50 --dry-run
  `);
}

function displayProfile(profile: Profile, label: string) {
  console.log(`\n${label}:`);
  console.log(`  Email: ${profile.email}`);
  console.log(`  Tier: ${profile.subscription_tier || 'none'}`);
  console.log(`  Status: ${profile.subscription_status || 'none'}`);
  console.log(`  Top-up Credits: ${profile.topup_credits}`);
}

async function addCredits(options: AddCreditsOptions): Promise<void> {
  const supabase = createServiceRoleClient();

  console.log(`\n🔍 Looking up user: ${options.email}`);

  // Fetch current profile
  const { data: currentProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email, subscription_tier, subscription_status, topup_credits')
    .eq('email', options.email)
    .single();

  if (fetchError || !currentProfile) {
    console.error(`❌ Error: User not found with email: ${options.email}`);
    console.error('   Make sure the user has logged in at least once to create a profile.');
    return;
  }

  const profile = currentProfile as Profile;
  displayProfile(profile, '📋 Current Profile');

  const currentCredits = profile.topup_credits || 0;
  const newCredits = currentCredits + options.credits;

  console.log(`\n📝 Planned Changes:`);
  console.log(`  Top-up Credits: ${currentCredits} → ${newCredits} (+${options.credits})`);
  console.log(`  (Subscription tier and status will NOT be modified)`);

  if (options.dryRun) {
    console.log(`\n✅ Dry run complete - no changes made`);
    return;
  }

  // Execute update
  console.log(`\n⚙️  Applying changes...`);
  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({ topup_credits: newCredits })
    .eq('id', profile.id)
    .select('id, email, subscription_tier, subscription_status, topup_credits')
    .single();

  if (updateError) {
    console.error(`❌ Error updating profile:`, updateError);
    return;
  }

  displayProfile(updatedProfile as Profile, '✅ Updated Profile');

  console.log(`\n🎉 Successfully added ${options.credits} credits to ${options.email}`);
}

async function main() {
  const options = parseArgs();

  if (!options) {
    process.exit(1);
  }

  try {
    await addCredits(options);
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

main();
