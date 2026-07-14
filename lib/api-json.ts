import { NextRequest, NextResponse } from 'next/server';

export class InvalidJsonBodyError extends Error {
  constructor() {
    super('Invalid JSON body');
    this.name = 'InvalidJsonBodyError';
  }
}

export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new InvalidJsonBodyError();
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidJsonBodyError();
  }

  return body as Record<string, unknown>;
}

export function isInvalidJsonBodyError(error: unknown): error is InvalidJsonBodyError {
  return error instanceof InvalidJsonBodyError;
}

export function invalidJsonBodyResponse() {
  return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
}
