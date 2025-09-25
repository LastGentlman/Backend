// TypeScript declarations for k6
// This file provides type definitions for k6 modules

declare module 'k6/http' {
  export interface HTTPResponse {
    status: number;
    body: string;
    headers: Record<string, string>;
    timings: {
      duration: number;
      blocked: number;
      connecting: number;
      receiving: number;
      sending: number;
      tls_handshaking: number;
      waiting: number;
    };
  }

  export interface HTTPParams {
    headers?: Record<string, string>;
    timeout?: string;
    tags?: Record<string, string>;
  }

  export function get(url: string, params?: HTTPParams): HTTPResponse;
  export function post(url: string, body?: string, params?: HTTPParams): HTTPResponse;
  export function put(url: string, body?: string, params?: HTTPParams): HTTPResponse;
  export function del(url: string, params?: HTTPParams): HTTPResponse;
  export function patch(url: string, body?: string, params?: HTTPParams): HTTPResponse;
  export function request(method: string, url: string, body?: string, params?: HTTPParams): HTTPResponse;
}

declare module 'k6' {
  export interface CheckResult {
    [name: string]: boolean;
  }

  export function check(response: any, checks: Record<string, (response: any) => boolean>): CheckResult;
  export function sleep(time: number): void;
  export function group(name: string, fn: () => void): void;
  export function fail(message: string): void;
}

declare module 'k6/metrics' {
  export class Rate {
    constructor(name: string);
    add(value: boolean | number): void;
  }

  export class Trend {
    constructor(name: string);
    add(value: number): void;
  }

  export class Counter {
    constructor(name: string);
    add(value?: number): void;
  }

  export class Gauge {
    constructor(name: string);
    add(value: number): void;
  }
}

// Global k6 variables
declare const __ENV: Record<string, string>;
declare const __VU: number;
declare const __ITER: number;

// k6 options interface
export interface K6Options {
  stages?: Array<{
    duration: string;
    target: number;
  }>;
  thresholds?: Record<string, string[]>;
  vus?: number;
  duration?: string;
  iterations?: number;
  maxDuration?: string;
  gracefulStop?: string;
  noUsageReport?: boolean;
  userAgent?: string;
  batch?: number;
  batchPerHost?: number;
  httpDebug?: string;
  noVUConnectionReuse?: boolean;
  minIterationDuration?: string;
  discardResponseBodies?: boolean;
  scenarios?: Record<string, any>;
}

declare global {
  const options: K6Options;
} 