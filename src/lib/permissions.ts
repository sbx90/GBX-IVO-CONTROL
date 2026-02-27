export type UserRole = 'admin' | 'stock_agent' | 'ticket_agent' | 'production_agent';

export interface RoleConfig {
  label: string;
  allowedRoutes: string[];  // matched as prefix
  defaultRoute: string;
  canDeploy: boolean;
  canAccessSettings: boolean;
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  admin: {
    label: 'Admin',
    allowedRoutes: ['/', '/stock', '/kits', '/tickets', '/production'],
    defaultRoute: '/',
    canDeploy: true,
    canAccessSettings: true,
  },
  stock_agent: {
    label: 'Stock Agent',
    allowedRoutes: ['/stock', '/kits', '/production'],
    defaultRoute: '/stock',
    canDeploy: false,
    canAccessSettings: false,
  },
  ticket_agent: {
    label: 'Ticket Agent',
    allowedRoutes: ['/tickets'],
    defaultRoute: '/tickets',
    canDeploy: false,
    canAccessSettings: false,
  },
  production_agent: {
    label: 'Production Agent',
    allowedRoutes: ['/stock', '/kits', '/production'],
    defaultRoute: '/stock',
    canDeploy: false,
    canAccessSettings: false,
  },
};

export function canAccess(role: UserRole, pathname: string): boolean {
  const cfg = ROLE_CONFIG[role];
  return cfg.allowedRoutes.some((r) =>
    r === '/' ? pathname === '/' : pathname === r || pathname.startsWith(r + '/')
  );
}

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && role in ROLE_CONFIG;
}
