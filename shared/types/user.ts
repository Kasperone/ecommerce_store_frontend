export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: 'admin' | 'customer'
  isEmailVerified: boolean
  createdAt: string
  updatedAt: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignUpData {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
}

export interface AuthResponse {
  user: User
  token: string
  expiresAt: string
}