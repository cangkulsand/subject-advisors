import tseslint from 'typescript-eslint';
export default tseslint.config({ ignores: ['tools/auth/local/worker-env.d.ts'] }, ...tseslint.configs.recommended, {
  files: ['apps/**/*.{ts,tsx}'],
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
});
