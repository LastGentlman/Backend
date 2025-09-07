import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import dashboard from '../routes/dashboard.ts'

// Mock Supabase
const mockSupabase = {
  from: vi.fn(),
}

vi.mock('../utils/supabase.ts', () => ({
  getSupabaseClient: () => mockSupabase,
  getUserFromToken: vi.fn(),
  getBusinessContext: vi.fn(),
}))

// Mock security utils
vi.mock('../utils/security.ts', () => ({
  logXSSAttempt: vi.fn(),
}))

describe('Dashboard Stats Endpoint', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.route('/api/dashboard', dashboard)
  })

  it('should return mock data for dashboard stats', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
    }

    const mockContext = {
      employee: { id: 'emp-1' },
      business: { id: 'test-business-id' },
      isOwner: true,
    }

    const { getUserFromToken, getBusinessContext } = await import('../utils/supabase.ts')
    vi.mocked(getUserFromToken).mockResolvedValue(mockUser)
    vi.mocked(getBusinessContext).mockResolvedValue(mockContext)

    const req = new Request('http://localhost/api/dashboard/stats/test-business-id', {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    })

    const res = await app.request(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.stats).toBeDefined()
    expect(data.stats.today).toBeDefined()
    expect(data.stats.thisMonth).toBeDefined()
    expect(data.stats.lastMonth).toBeDefined()
    expect(data.stats.growth).toBeDefined()
    expect(data.stats.totals).toBeDefined()
    expect(data.note).toContain('Mock data')
  })

  it('should return 401 for missing authorization header', async () => {
    const req = new Request('http://localhost/api/dashboard/stats/test-business-id')

    const res = await app.request(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toContain('Missing or invalid authorization header')
  })

  it('should return 401 for invalid token', async () => {
    const { getUserFromToken } = await import('../utils/supabase.ts')
    vi.mocked(getUserFromToken).mockRejectedValue(new Error('Invalid token'))

    const req = new Request('http://localhost/api/dashboard/stats/test-business-id', {
      headers: {
        'Authorization': 'Bearer invalid-token',
      },
    })

    const res = await app.request(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toContain('Invalid token')
  })

  it('should return 403 for unauthorized business access', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
    }

    const mockContext = {
      employee: { id: 'emp-1' },
      business: { id: 'different-business-id' }, // Different business ID
      isOwner: true,
    }

    const { getUserFromToken, getBusinessContext } = await import('../utils/supabase.ts')
    vi.mocked(getUserFromToken).mockResolvedValue(mockUser)
    vi.mocked(getBusinessContext).mockResolvedValue(mockContext)

    const req = new Request('http://localhost/api/dashboard/stats/test-business-id', {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    })

    const res = await app.request(req)
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toContain('Acceso no autorizado')
    expect(data.code).toBe('UNAUTHORIZED_BUSINESS_ACCESS')
  })

  it('should handle unexpected errors gracefully', async () => {
    const { getUserFromToken } = await import('../utils/supabase.ts')
    vi.mocked(getUserFromToken).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const req = new Request('http://localhost/api/dashboard/stats/test-business-id', {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    })

    const res = await app.request(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toContain('Unexpected error')
  })

  it('should return proper mock data structure', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
    }

    const mockContext = {
      employee: { id: 'emp-1' },
      business: { id: 'test-business-id' },
      isOwner: true,
    }

    const { getUserFromToken, getBusinessContext } = await import('../utils/supabase.ts')
    vi.mocked(getUserFromToken).mockResolvedValue(mockUser)
    vi.mocked(getBusinessContext).mockResolvedValue(mockContext)

    const req = new Request('http://localhost/api/dashboard/stats/test-business-id', {
      headers: {
        'Authorization': 'Bearer test-token',
      },
    })

    const res = await app.request(req)
    const data = await res.json()

    // Verify the structure of mock data
    expect(data.stats.today).toEqual({
      total: 0,
      pending: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
      totalAmount: 0,
    })

    expect(data.stats.thisMonth).toEqual({
      total: 0,
      totalAmount: 0,
      avgOrderValue: 0,
    })

    expect(data.stats.lastMonth).toEqual({
      total: 0,
      totalAmount: 0,
    })

    expect(data.stats.growth).toEqual({
      orders: 0,
      revenue: 0,
    })

    expect(data.stats.totals).toEqual({
      products: 0,
      clients: 0,
    })

    expect(data.timestamp).toBeDefined()
    expect(data.note).toContain('Mock data')
  })
})
