import type { ComponentType } from 'react';
export interface StudentPageProps { getToken: () => Promise<string | null>; setup?: boolean }
export interface InstalledStudentPages {
  Profile?: ComponentType<StudentPageProps>;
  Records?: ComponentType<StudentPageProps>;
  Offerings?: ComponentType<StudentPageProps>;
}
