// Exports reproducible fictional fixtures only. Does not access a database or identity service.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const output = await build({ stdin: { contents: "export { demoData } from './tools/p002/demo-data.ts';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { demoData } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
const data = demoData(), directory = resolve('.wrangler/p002-demo');
await mkdir(directory, { recursive: true });
for (const [name, value] of Object.entries({ 'fictional-cohort': data.cohort, 'initial-demand': data.initial, 'student-eligibility': data.student, 'expected-results': data.expected })) {
  await writeFile(resolve(directory, name + '.json'), JSON.stringify(value, null, 2) + '\n');
}
console.log('Exported 50 fictional students and derived results to .wrangler/p002-demo/');
console.log(JSON.stringify(data.expected));
