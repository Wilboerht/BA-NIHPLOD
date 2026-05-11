// 认证相关类型
export interface AuthUser {
  id: string;
  username?: string;
  phone?: string;
  full_name?: string;
  role: string;
}

export interface TokenPayload {
  id: string;
  username?: string;
  phone?: string;
  full_name?: string;
  role: string;
  jti?: string;
}

// 数据库实体类型
export interface Profile {
  id: string;
  username: string;
  full_name?: string;
  phone?: string;
  role: 'SUPER_ADMIN' | 'AUDITOR' | 'MANAGER' | 'PROJECT_MANAGER' | 'DEALER';
  is_first_login: boolean;
  is_banned: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Dealer {
  id: string;
  company_name: string;
  phone: string;
  contact_person?: string;
  email?: string;
  address?: string;
  created_at?: string;
}

export interface Certificate {
  id: string;
  cert_number: string;
  dealer_id: string;
  template_id?: string;
  auth_scope: string;
  start_date: string;
  end_date: string;
  status: 'PENDING' | 'ISSUED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
  final_image_url?: string;
  seal_url?: string;
  auditor_id?: string;
  manager_id?: string;
  created_at?: string;
}

export interface Complaint {
  id: string;
  description: string;
  channel: string;
  evidence_image_url?: string;
  status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'REJECTED';
  handler_id?: string;
  review_note?: string;
  created_at: string;
  updated_at?: string;
}

export interface Template {
  id: string;
  name: string;
  background_url?: string;
  stamp_url?: string;
  config?: Record<string, unknown>;
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 证书验证结果
export interface CertificateVerifyResult {
  id: string;
  dealerName: string;
  duration: string;
  scope: string;
  status: string;
  final_image_url?: string;
}
