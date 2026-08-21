/**
 * TypeScript types for Chrome Extension API contracts
 */

export interface PairingCodeResponse {
  code: string;
  display: string;
  expires_at: string;
}

export interface ExchangeCodeRequest {
  code: string;
  label?: string;
}

export interface ExchangeCodeResponse {
  token: string;
  label?: string;
  created_at: string;
}

export interface SyncPointsRequest {
  program_code: string;
  balance: number;
  expiry_date?: string;
  captured_at?: string;
  page_host?: string;
}

export interface SyncPointsResponse {
  ok: boolean;
  program_code: string;
  balance: number;
  last_updated: string;
}

export interface ExtensionMeResponse {
  ok: boolean;
  connected: boolean;
  last_used_at?: string;
  user_id?: string;
}

export interface TokenInfo {
  id: string;
  label?: string;
  created_at: string;
  last_used_at?: string;
  revoked_at?: string;
}

export interface ListTokensResponse {
  tokens: TokenInfo[];
}

export interface ProgramInfo {
  id: number;
  program_code: string;
  program_name: string;
  program_type?: string;
}

export interface ListProgramsResponse {
  programs: ProgramInfo[];
}

export interface RevokeTokenRequest {
  token_id?: string;
}

export interface ExtensionError {
  error: string;
  status?: number;
}

export interface RateLimitConfig {
  window: number; // milliseconds
  max: number;
}

export interface RateLimiterBucket {
  count: number;
  resetAt: number;
}
