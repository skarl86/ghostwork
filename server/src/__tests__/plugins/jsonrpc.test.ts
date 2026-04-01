/**
 * JSON-RPC 2.0 protocol tests.
 */

import { describe, it, expect } from 'vitest';
import {
  createRequest,
  createNotification,
  createSuccessResponse,
  createErrorResponse,
  parseMessage,
  serializeMessage,
  isRequest,
  isResponse,
  isNotification,
  RPC_METHOD_NOT_FOUND,
  RPC_PARSE_ERROR,
} from '../../plugins-system/jsonrpc.js';

describe('JSON-RPC 2.0', () => {
  describe('createRequest', () => {
    it('should create a valid request with id', () => {
      const req = createRequest('test.method', { key: 'value' }, 1);
      expect(req.jsonrpc).toBe('2.0');
      expect(req.method).toBe('test.method');
      expect(req.params).toEqual({ key: 'value' });
      expect(req.id).toBe(1);
    });

    it('should create request without params', () => {
      const req = createRequest('ping', undefined, 42);
      expect(req.jsonrpc).toBe('2.0');
      expect(req.method).toBe('ping');
      expect(req.params).toBeUndefined();
      expect(req.id).toBe(42);
    });
  });

  describe('createNotification', () => {
    it('should create a notification (no id)', () => {
      const notif = createNotification('event.fired', { data: 123 });
      expect(notif.jsonrpc).toBe('2.0');
      expect(notif.method).toBe('event.fired');
      expect(notif.id).toBeUndefined();
    });
  });

  describe('createSuccessResponse', () => {
    it('should create a success response', () => {
      const res = createSuccessResponse(1, { count: 42 });
      expect(res.jsonrpc).toBe('2.0');
      expect(res.result).toEqual({ count: 42 });
      expect(res.id).toBe(1);
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response', () => {
      const res = createErrorResponse(1, RPC_METHOD_NOT_FOUND, 'Method not found');
      expect(res.jsonrpc).toBe('2.0');
      expect(res.error.code).toBe(RPC_METHOD_NOT_FOUND);
      expect(res.error.message).toBe('Method not found');
      expect(res.id).toBe(1);
    });

    it('should include optional data', () => {
      const res = createErrorResponse(null, RPC_PARSE_ERROR, 'Parse error', { raw: 'bad json' });
      expect(res.error.data).toEqual({ raw: 'bad json' });
      expect(res.id).toBeNull();
    });
  });

  describe('parseMessage', () => {
    it('should parse valid JSON-RPC request', () => {
      const raw = JSON.stringify({ jsonrpc: '2.0', method: 'test', id: 1 });
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(isRequest(msg!)).toBe(true);
    });

    it('should parse valid JSON-RPC response', () => {
      const raw = JSON.stringify({ jsonrpc: '2.0', result: 'ok', id: 1 });
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(isResponse(msg!)).toBe(true);
    });

    it('should return null for invalid JSON', () => {
      const msg = parseMessage('not json');
      expect(msg).toBeNull();
    });

    it('should return null for non-2.0 version', () => {
      const raw = JSON.stringify({ jsonrpc: '1.0', method: 'test' });
      const msg = parseMessage(raw);
      expect(msg).toBeNull();
    });
  });

  describe('serializeMessage', () => {
    it('should serialize to valid JSON', () => {
      const req = createRequest('test', { a: 1 }, 1);
      const str = serializeMessage(req);
      const parsed = JSON.parse(str);
      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.method).toBe('test');
    });
  });

  describe('type guards', () => {
    it('isRequest identifies requests', () => {
      const req = createRequest('test', undefined, 1);
      expect(isRequest(req)).toBe(true);
    });

    it('isResponse identifies responses', () => {
      const res = createSuccessResponse(1, 'ok');
      expect(isResponse(res)).toBe(true);
    });

    it('isNotification identifies notifications', () => {
      const notif = createNotification('event');
      expect(isNotification(notif)).toBe(true);
    });

    it('request with id is not a notification', () => {
      const req = createRequest('test', undefined, 1);
      expect(isNotification(req)).toBe(false);
    });
  });
});
