import { createContext, useContext } from 'react';
import type { Me } from './contracts';

export const AccountContext = createContext<Me | undefined>(undefined);
export const AccountApiBaseContext = createContext('');
export function useAccountAccess() { return useContext(AccountContext); }
export function useAccountApiBase() { return useContext(AccountApiBaseContext); }
