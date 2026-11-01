import { vi } from 'vitest';
export const useSearchParams = () => new URLSearchParams();
export const useRouter = () => ({ replace: vi.fn(), refresh: vi.fn() });
export const usePathname = () => '/';
