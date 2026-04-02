import { readFile } from 'fs/promises';
import { join } from 'path';

export default async function handler(req, res) {
  const filePath = join(process.cwd(), 'public', 'index.html');
  const html = await readFile(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).send(html);
}

export const config = {
  api: {
    externalResolver: true,
  },
};
